"""公開施設限定の比較ケースと判定。ネットワーク通信は行わない。"""
import argparse
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.japanese_address import normalize_address


def variants(facility):
    prefix, nums = facility['prefix'], facility['numbers']
    hyphen = prefix + '-'.join(map(str, nums))
    wide = hyphen.translate(str.maketrans('0123456789-', '０１２３４５６７８９－'))
    if len(nums) == 3:
        chome, block, house = nums
        japanese = f'{prefix}{chome}丁目{block}番{house}号'
        kanji = '〇一二三四五六七八九'[chome]
        kanji_form = f'{prefix}{kanji}丁目{block}番{house}号'
        town = f'{prefix}{chome}丁目'
    else:
        japanese = hyphen  # 丁目なしの住所に、未確認の番地/号の方式を付け足さない。
        kanji_form = None  # 丁目のない住所へ架空の丁目を追加しない。
        town = prefix
    return dict(fullwidth=wide, halfwidth=japanese, chome=kanji_form, hyphen=hyphen, town=town)


def distance_meters(point, reference):
    if not point or not reference:
        return None
    lat1, lon1, lat2, lon2 = map(math.radians, (point['latitude'], point['longitude'], reference['latitude'], reference['longitude']))
    a = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return round(6371008.8 * 2 * math.asin(math.sqrt(min(1, a))), 1)


def assess(point_level, reference, distance, address_match):
    # 距離だけで番地一致や建物入口の一致を自動認定しない。
    if point_level is None:
        return '精度検証不可'
    if point_level <= 2:
        return '市区町村程度（サービス分類）'
    if point_level == 3:
        return '街区・町丁目付近（サービス分類）'
    if reference and distance is not None and distance <= 50 and address_match is True:
        return '参照施設付近・番地文字列一致（入口未確認）'
    return '精度検証不可'


def prepare():
    facilities = json.loads((ROOT/'docs/fixtures/geocoding-addresses.json').read_text(encoding='utf-8-sig'))
    cases = [dict(id=f['id'], name=f['name'], variant=kind, input=address,
                  normalized=normalize_address(address) if address else None, reference=f['reference'], source=f['source'])
             for f in facilities for kind, address in variants(f).items()]
    target = ROOT/'backend/instance/geocoding-cases.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding='utf-8')
    return cases


def report():
    path = ROOT/'backend/instance/geocoding-geolonia-raw.json'
    output_path = ROOT/'docs/fixtures/geocoding-geolonia-results.json'
    if not path.exists() and output_path.exists():
        previous = json.loads(output_path.read_text(encoding='utf-8'))
        print(json.dumps({'preservedRecordedResults':True, 'cases':len(previous['rows']), 'at':previous.get('at')}))
        return
    cases = prepare()
    raw = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'rows':[], 'network':[], 'version':None}
    indexed = {(r['id'],r['variant']):r for r in raw['rows']}
    rows = []
    for case in cases:
        measured = indexed.get((case['id'],case['variant']))
        result = (measured or {}).get('result') or {}
        point = result.get('point')
        location = dict(latitude=point['lat'], longitude=point['lng']) if point else None
        distance = distance_meters(location, case['reference'])
        returned = ''.join(result.get(k) or '' for k in ('pref','city','town','addr'))
        # 文字列の一致と、現地/独立資料での位置確認を分離する。
        address_match = (result.get('level') == 8 and not result.get('other') and normalize_address(returned) == case['normalized']) if measured and not measured.get('error') and case['variant'] != 'town' else None
        evidence = 'not-applicable' if case['input'] is None else 'external-data' if measured and not measured.get('error') else 'unmeasured'
        rows.append(dict(**case, service='Geolonia '+str(raw['version']), evidence=evidence,
                         returnedAddress=returned, coordinates=location,
                         remainingText=result.get('other'), matchedRecord=(result.get('metadata') or {}).get('rsdt') or (result.get('metadata') or {}).get('chiban'),
                         normalizationLevel=result.get('level'), pointLevel=(point or {}).get('level'), distanceMeters=distance,
                         houseNumberMatched=address_match, buildingEntranceVerified=False, verdict=assess((point or {}).get('level'),case['reference'],distance,address_match) if evidence == 'external-data' else '該当表記なし' if evidence == 'not-applicable' else '未測定',
                         note=(measured or {}).get('error') or ('丁目なし・該当表記なし' if case['input'] is None else '番地・入口の独立照合は未完了')))
    runs = raw.get('acquisitionRuns') or [dict(at=raw.get('at'), network=raw['network'])]
    network = [call for run in runs for call in run['network']]
    attribution = dict(creator='株式会社Geolonia', title='Geolonia住所データv2（原典：デジタル庁アドレス・ベース・レジストリ）',
                       source='https://github.com/geolonia/japanese-addresses-v2', license='https://creativecommons.org/licenses/by/4.0/',
                       modification='d-map開発作業で公開施設の結果を抽出・正規化・比較・距離計算したもの。原典の未加工データではない。')
    output = dict(at=raw.get('at'), method='公開データ実取得＋ローカル正規化。検索APIの実測とは区別。', attribution=attribution, acquisitionRuns=runs, network=network, rows=rows)
    output_path.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'cases':len(rows), 'measured':sum(r['evidence']=='external-data' for r in rows), 'network':len(network)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', action='store_true')
    args = parser.parse_args()
    report() if args.report else prepare()
