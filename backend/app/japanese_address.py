"""住所の名前を変えず、数字の区切りだけを検索用に整える純粋関数。"""
import re
import unicodedata
from .validation import PREFECTURES


def kanji_number(text):
    digits = dict(zip('〇零一二三四五六七八九', [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))
    if '十' not in text:
        return int(''.join(str(digits[c]) for c in text))
    left, right = text.split('十')
    return (digits[left] if left else 1) * 10 + (digits[right] if right else 0)


def normalize_address(value):
    # 全文NFKCは建物名等の互換文字まで変えるため、全角ASCIIだけに限定する。
    value = ''.join(unicodedata.normalize('NFKC', c) if '\uff01' <= c <= '\uff5e' else c for c in value)
    value = re.sub(r'^\s*〒?\s*\d{3}-?\d{4}\s*', '', value)
    value = value.strip()
    # 数字に挟まれた長音だけを区切りにする。「センター」等は保存する。
    value = re.sub(r'(?<=\d)\s*[-‐‑‒–—―−ーｰ]\s*(?=\d)', '-', value)
    # 日本語住所部分の空白のみ除去。ラテン文字の建物名の単語間は保つ。
    value = re.sub(r'(?<=[\u3000-\u9fff\d])\s+(?=[\u3000-\u9fff\d])', '', value)
    value = re.sub(r'(?<![〇零一二三四五六七八九十百千万])([〇零一二三四五六七八九]+|[一二三四五六七八九]?十[一二三四五六七八九]?)(?=丁目)', lambda m: str(kanji_number(m[0])), value)
    value = re.sub(r'(\d+)\s*丁目\s*(\d+)\s*番(?:地)?\s*(\d+)\s*号', r'\1-\2-\3', value)
    value = re.sub(r'(\d+)丁目(?=\d+-\d+)', r'\1-', value)
    return value


def search_queries(value):
    """最大3形式。末尾が住所の番地だと解釈できる場合だけ段階的に省略する。"""
    normalized = normalize_address(value)
    queries = [(normalized, False)]
    match = re.fullmatch(r'(.+?)(?<![\d-])(\d+)-(\d+)-(\d+)', normalized)
    prefecture = next((p for p in PREFECTURES if normalized.startswith(p)), '')
    if match and prefecture:
        town, chome, block, house = match.groups()
        queries.append((f'{town}{chome}丁目{block}番{house}号', False))
        # 住所の行政区画でカンマを補う。元入力・保存住所は変更しない。
        # 京都・四日市など名前の途中を行政区切りと誤認しない。
        fallback = (prefecture + ', ' + town[len(prefecture):] if prefecture else town) + chome + '丁目'
        queries.append((fallback, True))
    return queries


def result_accuracy(row):
    """OSMのオブジェクト分類であり測量精度や入力住所との一致保証ではない。"""
    kind = row.get('addresstype')
    details = row.get('address') or {}
    if kind in ('house', 'building') and isinstance(details, dict) and details.get('house_number'):
        return 'building'
    if kind in ('neighbourhood', 'quarter', 'suburb', 'city_block', 'residential'):
        return 'town'
    if kind in ('city', 'town', 'village', 'municipality', 'county', 'city_district', 'borough'):
        return 'municipality'
    return 'unknown'
