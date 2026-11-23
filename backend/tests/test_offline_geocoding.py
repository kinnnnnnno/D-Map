"""Synthetic evaluation logic and read-only imports, not a new service measurement."""
from copy import deepcopy
from dataclasses import replace
import hashlib
import json
import socket
import pytest
from tools import offline_geocoding as evaluation
from tools.offline_geocoding import Candidate, Case, Coordinate


@pytest.fixture(autouse=True)
def prohibit_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('offline evaluation attempted network access')
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    monkeypatch.setattr(socket.socket, 'connect', forbidden)


def reference(kind='facility-representative'):
    return dict(coordinates=dict(latitude=35, longitude=139, crs='EPSG:4326'),
                pointKind=kind, verificationStatus='verified', uncertaintyMeters=5,
                rights={'redistributionStatus': 'confirmed'}, independence={'status': 'independent'})


def candidate(**changes):
    return replace(Candidate(Coordinate(35, 139, 'EPSG:4326'), 'house-number',
                             'address-point', True, False, False, {'pointLevel': 8}), **changes)


def case(variant='hyphen', evidence='recorded-external-data', candidates=None, provider='geolonia'):
    return Case(provider, 'test-facility', variant, evidence,
                'geolonia-comparison-v1' if provider == 'geolonia' else 'abr-common-v1',
                (candidate(),) if candidates is None else candidates)


def first(row, ref=None):
    return evaluation.evaluate([row], {'test-facility': ref or reference()})['rows'][0]


def test_distance_identical_and_known_meridian():
    start = Coordinate(0, 0, 'EPSG:4326')
    assert evaluation.distance_meters(start, start) == 0
    assert evaluation.distance_meters(start, Coordinate(1, 0, 'WGS84')) == pytest.approx(111195.1, abs=.1)


@pytest.mark.parametrize('point,code', [
    (Coordinate(None, 139), 'coordinates-missing'),
    (Coordinate(35, None), 'coordinates-missing'),
    (Coordinate(True, 139), 'coordinates-invalid'),
    (Coordinate('35', 139), 'coordinates-invalid'),
    (Coordinate(float('nan'), 139), 'coordinates-invalid'),
    (Coordinate(35, float('inf')), 'coordinates-invalid'),
    (Coordinate(10**1000, 139), 'coordinates-invalid'),
    (Coordinate(91, 181), 'coordinates-out-of-range'),
    (Coordinate(139, 35), 'axis-swap-suspected'),
    (Coordinate(-91, 20), 'axis-swap-suspected'),
])
def test_invalid_coordinates_not_repaired(point, code):
    assert code in evaluation.coordinate_issues(point)
    result = first(case(candidates=(candidate(coordinates=point),)))
    assert not result['distanceComputable']
    assert result['candidates'][0]['distanceMeters'] is None


@pytest.mark.parametrize('crs', [None, 'JGD2011', 'EPSG:6668', 'Tokyo', 'unknown'])
def test_unknown_or_unconverted_datum_never_compared(crs):
    point = Coordinate(35, 139, crs)
    with pytest.raises(ValueError):
        evaluation.distance_meters(point, Coordinate(35, 139, 'EPSG:4326'))
    result = first(case(candidates=(candidate(coordinates=point),)))
    assert not result['independentlyEvaluable'] and not result['distanceComputable']


def test_unknown_reference_datum_also_blocks_distance():
    ref = reference(); ref['coordinates']['crs'] = None
    assert not first(case(), ref)['distanceComputable']


@pytest.mark.parametrize('kind', ['facility-representative', 'building-center', 'entrance'])
def test_reference_kind_preserved_not_automatic_entrance_success(kind):
    result = first(case(), reference(kind))
    selected = result['candidates'][0]
    assert selected['referenceKind'] == kind and selected['distanceMeters'] == 0
    assert selected['distanceMeaning'] == 'horizontal-separation-from-reference'
    assert selected['entranceVerified'] is False
    assert result['independentlyEvaluable']


def test_unknown_reference_kind_blocks_evaluation():
    result = first(case(), reference('unknown'))
    assert not result['distanceComputable']
    assert 'reference-kind-unconfirmed' in result['candidates'][0]['issues']


@pytest.mark.parametrize('field,value,reason', [
    ('verificationStatus', 'needs-review', 'reference-not-verified'),
    ('uncertaintyMeters', None, 'reference-uncertainty-unconfirmed'),
    ('uncertaintyMeters', -1, 'reference-uncertainty-unconfirmed'),
    ('uncertaintyMeters', True, 'reference-uncertainty-unconfirmed'),
    ('independence', {'status': 'unknown'}, 'independence-unconfirmed'),
    ('rights', {'redistributionStatus': 'unconfirmed'}, 'redistribution-unconfirmed'),
])
def test_computable_distance_is_not_verified_precision(field, value, reason):
    ref = reference(); ref[field] = value
    result = first(case(), ref)
    assert result['distanceComputable'] and not result['independentlyEvaluable']
    assert reason in result['candidates'][0]['comparisonLimitations']


@pytest.mark.parametrize('changes', [
    {'query_fallback': True}, {'coordinate_fallback': True},
    {'query_fallback': None}, {'house_number_matched': None},
    {'recognition': 'town'},
])
def test_fallback_or_unknown_not_house_search_success(changes):
    assert not first(case(candidates=(candidate(**changes),)))['houseNumberSearchSuccess']


def test_town_input_not_house_search_and_recognition_not_accuracy():
    assert not first(case('town'))['houseNumberSearchSuccess']
    result = first(case(candidates=(candidate(coordinates=Coordinate(None, None)),)))
    assert result['houseNumberSearchSuccess']  # Address recognition only.
    assert not result['independentlyEvaluable']


def test_multiple_candidates_keep_order_not_nearest_to_reference():
    result = first(case(candidates=(candidate(coordinates=Coordinate(36, 139, 'WGS84')), candidate())))
    assert result['candidateCount'] == 2 and result['primaryCandidateIndex'] == 0
    assert result['candidates'][0]['distanceMeters'] > 100000
    assert result['candidates'][1]['distanceMeters'] == 0


def test_zero_candidates_and_evidence_states_are_separate():
    rows = [case('hyphen', candidates=()), case('fullwidth', 'error', ()),
            case('town', 'unmeasured', ()), case('chome', 'not-applicable', ())]
    summary = evaluation.evaluate(rows, {'test-facility': reference()})['summaries']['geolonia']
    assert summary['slots'] == 4 and summary['applicableCases'] == 3
    assert summary['recordedCases'] == 1 and summary['precisionUnverifiedCases'] == 3
    assert summary['independentlyEvaluableCases'] == 0


def test_facility_variant_and_candidate_counts_do_not_inflate_each_other():
    report = evaluation.evaluate([case('hyphen', candidates=(candidate(), candidate())),
                                  case('fullwidth'), case('town', 'synthetic')], {'test-facility': reference()})
    summary = report['summaries']['geolonia']
    assert summary['facilities'] == 1 and summary['recordedCases'] == 2
    assert summary['independentlyEvaluableCases'] == 2
    assert summary['independentlyEvaluableFacilities'] == 1
    assert summary['byVariant']['hyphen']['independentlyEvaluableCases'] == 1
    assert summary['precisionUnverifiedCases'] == 1  # Synthetic never counts as real evidence.


def test_provider_counts_separate_and_duplicates_rejected():
    report = evaluation.evaluate([case(), case(provider='abr')], {'test-facility': reference()})
    assert set(report['summaries']) == {'geolonia', 'abr'}
    with pytest.raises(ValueError):
        evaluation.evaluate([case(), case()], {'test-facility': reference()})
    with pytest.raises(ValueError):
        first(case('town', 'unmeasured'))


def test_legacy_import_keeps_original_precision_and_unknown_query_fallback():
    document = {'rows': [dict(id='test-facility', variant='hyphen', evidence='external-data',
                             coordinates={'latitude': 35, 'longitude': 139},
                             normalizationLevel=8, pointLevel=3, houseNumberMatched=True,
                             distanceMeters=123, secret='never-copy-this')]}
    saved = deepcopy(document)
    row = first(evaluation.import_geolonia(document)[0])
    assert document == saved
    selected = row['candidates'][0]
    assert selected['rawAccuracy'] == {'normalizationLevel': 8, 'pointLevel': 3}
    assert selected['fallback'] == {'query': None, 'coordinate': True}
    assert selected['coordinateKind'] == 'town-representative'
    assert selected['distanceMeters'] is None  # Legacy distance not blindly reused.
    assert 'never-copy-this' not in json.dumps(row)


def abr_document():
    return {'schemaVersion': 1, 'provider': 'abr', 'providerVersion': None, 'cases': [
        {'facilityId': 'test-facility', 'variant': 'hyphen', 'evidence': 'synthetic', 'candidates': [
            {'coordinates': dict(latitude=35, longitude=139, crs='EPSG:4326'),
             'recognition': 'house-number', 'coordinateKind': 'address-point', 'houseNumberMatched': True,
             'queryFallback': False, 'coordinateFallback': False,
             'rawAccuracy': {'matchLevel': 8, 'coordinateLevel': 8}}]}]}


def test_abr_interchange_is_explicitly_synthetic_not_native_measurement():
    row = first(evaluation.import_abr(abr_document())[0])
    assert row['sourceFormat'] == 'abr-common-v1'
    assert row['candidates'][0]['rawAccuracy'] == {'matchLevel': 8, 'coordinateLevel': 8}
    assert not row['independentlyEvaluable']


@pytest.mark.parametrize('mutation', ['extra-key', 'raw-token', 'invalid-flag'])
def test_interchange_rejects_unknown_fields_and_secret_reflection(mutation):
    document = abr_document(); item = document['cases'][0]['candidates'][0]
    if mutation == 'extra-key': item['apiKey'] = 'not-a-real-secret'
    elif mutation == 'raw-token': item['rawAccuracy'] = {'matchLevel': 'not-a-real-secret'}
    else: item['queryFallback'] = 'not-a-real-secret'
    with pytest.raises(ValueError) as error:
        first(evaluation.import_abr(document)[0])
    assert 'not-a-real-secret' not in str(error.value)


def test_checked_in_ledger_preserves_unknowns_and_all_ten_ids():
    ledger = evaluation.load_ledger(evaluation.FIXTURES/'geocoding-reference-ledger.json')
    original = evaluation.read_json(evaluation.FIXTURES/'geocoding-addresses.json')
    assert set(ledger) == {r['id'] for r in original} and len(ledger) == 10
    assert sum(r['coordinates']['latitude'] is not None for r in ledger.values()) == 1
    assert all(r['coordinates']['crs'] is None and r['sourceCheckedAt'] is None for r in ledger.values())
    assert all(r['uncertaintyMeters'] is None and r['independence']['status'] == 'unknown' for r in ledger.values())
    assert ledger['edogawa']['pointKind'] == 'facility-representative'
    old = next(r for r in original if r['id'] == 'edogawa')['reference']
    assert ledger['edogawa']['coordinates']['latitude'] == old['latitude']
    assert ledger['edogawa']['coordinateSourceUrl'] == old['source']
    document = evaluation.read_json(evaluation.FIXTURES/'geocoding-reference-ledger.json')
    assert document['sourceSha256'] == hashlib.sha256((evaluation.FIXTURES/'geocoding-addresses.json').read_bytes()).hexdigest()


def test_real_saved_import_and_cli_leave_measurements_unchanged(capsys, monkeypatch):
    paths = [evaluation.FIXTURES/p for p in ('geocoding-addresses.json', 'geocoding-geolonia-results.json',
                                            'geocoding-nominatim-observation.json')]
    before = [hashlib.sha256(p.read_bytes()).hexdigest() for p in paths]
    monkeypatch.setenv('GOOGLE_GEOCODING_API_KEY', 'not-a-real-secret')
    assert evaluation.main([]) == 0
    output = capsys.readouterr().out
    assert 'not-a-real-secret' not in output
    report = json.loads(output)
    assert report['externalRequests'] == 0
    assert report['summaries']['geolonia']['recordedCases'] == 46
    assert report['summaries']['geolonia']['applicableCases'] == 46
    assert report['summaries']['abr']['recordedCases'] == 0
    assert report['summaries']['abr']['evidenceCounts']['unmeasured'] == 46
    assert all(s['independentlyEvaluableCases'] == 0 for s in report['summaries'].values())
    assert before == [hashlib.sha256(p.read_bytes()).hexdigest() for p in paths]


@pytest.mark.parametrize('change', [
    {'provider': 'google'}, {'facility_id': 'not-in-ledger'}, {'variant': 'not-supported'},
    {'evidence': 'success'}, {'source_format': 'abr-common-v1'},
])
def test_invalid_case_metadata_rejected(change):
    with pytest.raises(ValueError):
        first(replace(case(), **change))


def test_cli_errors_do_not_echo_untrusted_input(tmp_path, capsys):
    path = tmp_path/'bad.json'; path.write_text('{"token":"not-a-real-secret"}', encoding='utf-8')
    assert evaluation.main(['--ledger', str(path)]) == 2
    assert 'not-a-real-secret' not in capsys.readouterr().out


def test_ledger_duplicate_ids_and_unknown_kind_rejected(tmp_path):
    row = dict(reference(), facilityId='test-facility')
    path = tmp_path/'ledger.json'
    path.write_text(json.dumps({'schemaVersion': 1, 'facilities': [row, row]}), encoding='utf-8')
    with pytest.raises(ValueError):
        evaluation.load_ledger(path)
    row['pointKind'] = 'house-number'
    path.write_text(json.dumps({'schemaVersion': 1, 'facilities': [row]}), encoding='utf-8')
    with pytest.raises(ValueError):
        evaluation.load_ledger(path)


def test_partial_abr_import_keeps_missing_cases_in_denominator():
    geolonia = [case('hyphen'), case('town'), case('chome', 'not-applicable', ())]
    abr = evaluation.complete_abr_cases(geolonia, [case('hyphen', provider='abr')])
    report = evaluation.evaluate(abr, {'test-facility': reference()})['summaries']['abr']
    assert report['slots'] == 3 and report['applicableCases'] == 2
    assert report['evidenceCounts'] == {'recorded-external-data': 1, 'unmeasured': 1, 'not-applicable': 1}
