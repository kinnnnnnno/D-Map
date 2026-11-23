"""Offline evaluation only: no Flask, database, environment keys or network imports.

Distances describe separation from a named reference, never automatic accuracy.
Unknown CRS is deliberately not replaced by WGS84.
"""
import argparse
from collections import Counter
from dataclasses import asdict, dataclass, field
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'docs/fixtures'
VARIANTS = {'fullwidth', 'halfwidth', 'chome', 'hyphen', 'town'}
KINDS = {'facility-representative', 'building-center', 'entrance', 'address-point',
         'town-representative', 'municipality-representative', 'unknown'}
RECOGNITION = {'house-number', 'town', 'municipality', 'prefecture', 'unknown'}
EVIDENCE = {'recorded-external-data', 'synthetic', 'unmeasured', 'error', 'not-applicable'}


@dataclass(frozen=True)
class Coordinate:
    latitude: float | None
    longitude: float | None
    crs: str | None = None


@dataclass(frozen=True)
class Candidate:
    coordinates: Coordinate
    recognition: str = 'unknown'
    coordinate_kind: str = 'unknown'
    house_number_matched: bool | None = None
    query_fallback: bool | None = None
    coordinate_fallback: bool | None = None
    # Original precision numbers are retained; not a shared scale across providers.
    raw_accuracy: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Case:
    provider: str
    facility_id: str
    variant: str
    evidence: str
    source_format: str
    candidates: tuple[Candidate, ...] = ()
    provider_version: str | None = None


def numeric(value):
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def coordinate_issues(point):
    lat, lon = point.latitude, point.longitude
    if lat is None or lon is None:
        return ['coordinates-missing']
    if not numeric(lat) or not numeric(lon):
        return ['coordinates-invalid']
    if abs(lat) > 90 or abs(lon) > 180:
        issues = ['coordinates-out-of-range']
        if abs(lon) <= 90 and abs(lat) <= 180:
            issues.append('axis-swap-suspected')
        return issues
    return []


def distance_meters(first, second):
    """Spherical horizontal distance, not an entrance/error certification.

Only explicitly WGS84/EPSG:4326 points are supported. No implicit datum conversion.
    """
    if coordinate_issues(first) or coordinate_issues(second):
        raise ValueError('invalid coordinates')
    if first.crs not in ('WGS84', 'EPSG:4326') or second.crs not in ('WGS84', 'EPSG:4326'):
        raise ValueError('unsupported or unknown CRS')
    lat1, lon1, lat2, lon2 = map(math.radians,
                                (first.latitude, first.longitude, second.latitude, second.longitude))
    a = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return round(6371008.8 * 2 * math.asin(math.sqrt(min(1, max(0, a)))), 1)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def load_ledger(path):
    document = read_json(path)
    if document.get('schemaVersion') != 1 or not isinstance(document.get('facilities'), list):
        raise ValueError('unsupported ledger schema')
    ledger = {}
    for row in document['facilities']:
        facility_id = row['facilityId']
        if not isinstance(facility_id, str) or facility_id in ledger:
            raise ValueError('invalid or duplicate facility')
        if row['pointKind'] not in KINDS or row['pointKind'] in ('address-point', 'town-representative', 'municipality-representative'):
            raise ValueError('invalid reference kind')
        point = row['coordinates']
        if not isinstance(point, dict) or set(point) != {'latitude', 'longitude', 'crs'}:
            raise ValueError('invalid reference coordinate schema')
        Coordinate(**point)
        ledger[facility_id] = row
    return ledger


def point_kind(level):
    return {8: 'address-point', 3: 'town-representative',
            2: 'municipality-representative'}.get(level, 'unknown')


def recognition(level):
    return {8: 'house-number', 3: 'town', 2: 'municipality', 1: 'prefecture'}.get(level, 'unknown')


def precision_number(value):
    # Do not copy arbitrary raw response text or possible credentials to output.
    return value if type(value) is int and 0 <= value <= 100 else None


def import_geolonia(document):
    """Read saved public comparison JSON; no new request and no legacy distance reuse."""
    cases = []
    for row in document['rows']:
        evidence = {'external-data': 'recorded-external-data', 'not-applicable': 'not-applicable'}.get(row['evidence'], 'unmeasured')
        candidates = ()
        if evidence == 'recorded-external-data':
            point = row.get('coordinates') or {}
            address_level = precision_number(row.get('normalizationLevel'))
            point_level = precision_number(row.get('pointLevel'))
            matched = row.get('houseNumberMatched')
            candidates = (Candidate(
                Coordinate(point.get('latitude'), point.get('longitude')),  # CRS absent in legacy JSON.
                recognition(address_level), point_kind(point_level),
                matched if type(matched) is bool else None,
                None,  # Legacy JSON has no query-fallback trace. Do not invent False.
                point_level < address_level if point_level is not None and address_level is not None else None,
                {'normalizationLevel': address_level, 'pointLevel': point_level}),)
        version = re.fullmatch(r'Geolonia (\d+\.\d+\.\d+)', row.get('service', ''))
        cases.append(Case('geolonia', row['id'], row['variant'], evidence,
                          'geolonia-comparison-v1', candidates, version[1] if version else None))
    return cases


def import_abr(document):
    """Explicit offline interchange, NOT a parser claiming to know native ABR output.

Phase 3.3.4 must map a fixed ABR version's native precision fields with evidence.
Only allowlisted fields are accepted; no raw URL, token, error text or environment.
    """
    if set(document) != {'schemaVersion', 'provider', 'providerVersion', 'cases'} or document['schemaVersion'] != 1 or document['provider'] != 'abr':
        raise ValueError('unsupported ABR interchange')
    cases = []
    for row in document['cases']:
        if set(row) != {'facilityId', 'variant', 'evidence', 'candidates'}:
            raise ValueError('unsupported ABR case fields')
        candidates = []
        for item in row['candidates']:
            if set(item) != {'coordinates', 'recognition', 'coordinateKind', 'houseNumberMatched',
                             'queryFallback', 'coordinateFallback', 'rawAccuracy'}:
                raise ValueError('unsupported candidate fields')
            raw = item['rawAccuracy']
            if not isinstance(raw, dict) or not set(raw) <= {'matchLevel', 'coordinateLevel'} or any(v is not None and precision_number(v) is None for v in raw.values()):
                raise ValueError('unsupported native accuracy fields')
            if set(item['coordinates']) != {'latitude', 'longitude', 'crs'}:
                raise ValueError('unsupported coordinates')
            candidates.append(Candidate(Coordinate(**item['coordinates']), item['recognition'],
                                        item['coordinateKind'], item['houseNumberMatched'],
                                        item['queryFallback'], item['coordinateFallback'], raw))
        cases.append(Case('abr', row['facilityId'], row['variant'], row['evidence'],
                          'abr-common-v1', tuple(candidates), document['providerVersion']))
    return cases


def evaluate_candidate(candidate, reference, variant, evidence):
    if candidate.recognition not in RECOGNITION or candidate.coordinate_kind not in KINDS:
        raise ValueError('unsupported classification')
    flags = (candidate.house_number_matched, candidate.query_fallback, candidate.coordinate_fallback)
    if any(value is not None and type(value) is not bool for value in flags):
        raise ValueError('invalid tri-state flag')
    if (not isinstance(candidate.raw_accuracy, dict)
            or not set(candidate.raw_accuracy) <= {'normalizationLevel', 'pointLevel', 'matchLevel', 'coordinateLevel'}
            or any(v is not None and precision_number(v) is None for v in candidate.raw_accuracy.values())):
        raise ValueError('unsupported raw accuracy')
    issues = coordinate_issues(candidate.coordinates)
    ref_point = Coordinate(**reference['coordinates'])
    issues += ['reference-'+code for code in coordinate_issues(ref_point)]
    if candidate.coordinates.crs not in ('EPSG:4326', 'WGS84'):
        issues.append('result-crs-unconfirmed-or-unsupported')
    if ref_point.crs not in ('EPSG:4326', 'WGS84'):
        issues.append('reference-crs-unconfirmed-or-unsupported')
    if reference['pointKind'] == 'unknown':
        issues.append('reference-kind-unconfirmed')
    computed = not issues and evidence in ('recorded-external-data', 'synthetic')
    distance = distance_meters(candidate.coordinates, ref_point) if computed else None
    limitations = []
    if reference['verificationStatus'] != 'verified':
        limitations.append('reference-not-verified')
    if reference['independence']['status'] != 'independent':
        limitations.append('independence-unconfirmed')
    if reference['rights']['redistributionStatus'] != 'confirmed':
        limitations.append('redistribution-unconfirmed')
    if not numeric(reference['uncertaintyMeters']) or reference['uncertaintyMeters'] < 0:
        limitations.append('reference-uncertainty-unconfirmed')
    if candidate.coordinate_kind == 'unknown':
        limitations.append('result-kind-unconfirmed')
    if evidence != 'recorded-external-data':
        limitations.append('not-recorded-external-evidence')
    independent = computed and not limitations
    # Recognition success is not a coordinate accuracy or entrance judgement.
    house = (evidence in ('recorded-external-data', 'synthetic') and variant != 'town'
             and candidate.recognition == 'house-number' and candidate.house_number_matched is True
             and candidate.query_fallback is False and candidate.coordinate_fallback is False)
    return {'recognition': candidate.recognition, 'coordinateKind': candidate.coordinate_kind,
            'coordinates': asdict(candidate.coordinates), 'rawAccuracy': candidate.raw_accuracy,
            'houseNumberMatched': candidate.house_number_matched,
            'fallback': {'query': candidate.query_fallback, 'coordinate': candidate.coordinate_fallback},
            'houseNumberSearchSuccess': house, 'referenceKind': reference['pointKind'],
            'distanceMeters': distance,
            'distanceMeaning': None if distance is None else 'horizontal-separation-from-reference',
            'verificationStatus': 'reference-comparison-available' if independent else 'precision-unverified',
            'issues': issues, 'comparisonLimitations': limitations, 'entranceVerified': False}


def evaluate(cases, ledger):
    rows = []; seen = set()
    for case in cases:
        key = (case.provider, case.facility_id, case.variant)
        if (key in seen or case.provider not in ('geolonia', 'abr') or case.facility_id not in ledger
                or case.source_format != {'geolonia': 'geolonia-comparison-v1', 'abr': 'abr-common-v1'}.get(case.provider)
                or case.variant not in VARIANTS or case.evidence not in EVIDENCE):
            raise ValueError('duplicate or unsupported case')
        seen.add(key)
        if case.provider_version is not None and (not isinstance(case.provider_version, str)
                                                  or not re.fullmatch(r'\d+\.\d+\.\d+', case.provider_version)):
            raise ValueError('invalid provider version')
        if case.evidence in ('unmeasured', 'not-applicable', 'error') and case.candidates:
            raise ValueError('candidates conflict with evidence')
        candidates = [evaluate_candidate(c, ledger[case.facility_id], case.variant, case.evidence) for c in case.candidates]
        # Preserve provider order. Never choose the nearest-to-reference candidate.
        primary = candidates[0] if candidates else None
        rows.append({'provider': case.provider, 'facilityId': case.facility_id, 'variant': case.variant,
                     'sourceFormat': case.source_format, 'evidence': case.evidence,
                     'providerVersion': case.provider_version,
                     'candidateCount': len(candidates), 'candidates': candidates,
                     'primaryCandidateIndex': 0 if primary else None,
                     'distanceComputable': primary is not None and primary['distanceMeters'] is not None,
                     'independentlyEvaluable': primary is not None and primary['verificationStatus'] == 'reference-comparison-available',
                     'houseNumberSearchSuccess': primary is not None and primary['houseNumberSearchSuccess']})
    summaries = {}
    for provider in sorted({row['provider'] for row in rows}):
        selected = [r for r in rows if r['provider'] == provider]
        applicable = [r for r in selected if r['evidence'] != 'not-applicable']
        real = [r for r in applicable if r['evidence'] == 'recorded-external-data']
        summaries[provider] = {
            'slots': len(selected), 'applicableCases': len(applicable),
            'evidenceCounts': dict(Counter(r['evidence'] for r in selected)),
            'recordedCases': len(real),
            'distanceComputableCases': sum(r['distanceComputable'] for r in real),
            'independentlyEvaluableCases': sum(r['independentlyEvaluable'] for r in real),
            'precisionUnverifiedCases': sum(not r['independentlyEvaluable'] for r in applicable),
            'houseNumberSearchSuccessCases': sum(r['houseNumberSearchSuccess'] for r in real),
            'facilities': len({r['facilityId'] for r in applicable}),
            'recordedFacilities': len({r['facilityId'] for r in real}),
            'distanceComputableFacilities': len({r['facilityId'] for r in real if r['distanceComputable']}),
            'independentlyEvaluableFacilities': len({r['facilityId'] for r in real if r['independentlyEvaluable']}),
            'precisionUnverifiedFacilities': len({r['facilityId'] for r in applicable}
                                                - {r['facilityId'] for r in real if r['independentlyEvaluable']}),
            'byVariant': {v: {'applicableCases': sum(r['variant'] == v for r in applicable),
                             'independentlyEvaluableCases': sum(r['variant'] == v and r['independentlyEvaluable'] for r in real)}
                          for v in sorted(VARIANTS)}}
    return {'schemaVersion': 1, 'externalRequests': 0, 'rows': rows, 'summaries': summaries}


def complete_abr_cases(geolonia, abr):
    """Keep absent ABR cases visible instead of silently shrinking the denominator."""
    present = {(case.facility_id, case.variant) for case in abr}
    return list(abr) + [Case('abr', c.facility_id, c.variant,
                            'not-applicable' if c.evidence == 'not-applicable' else 'unmeasured',
                            'abr-common-v1') for c in geolonia if (c.facility_id, c.variant) not in present]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ledger', type=Path, default=FIXTURES/'geocoding-reference-ledger.json')
    parser.add_argument('--geolonia', type=Path, default=FIXTURES/'geocoding-geolonia-results.json')
    parser.add_argument('--abr', type=Path, help='Reviewed offline abr-common-v1 interchange only')
    args = parser.parse_args(argv)
    try:
        ledger = load_ledger(args.ledger)
        cases = import_geolonia(read_json(args.geolonia))
        cases += complete_abr_cases(cases, import_abr(read_json(args.abr)) if args.abr else [])
        report = evaluate(cases, ledger)
        # CLI intentionally emits aggregate counts only; no raw response/secret reflection.
        print(json.dumps({'schemaVersion': 1, 'externalRequests': 0, 'summaries': report['summaries']}, indent=2))
        return 0
    except (ValueError, KeyError, TypeError, OSError, AttributeError):
        print('Invalid offline evaluation input; check schema and reference ledger.')
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
