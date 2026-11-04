import pytest
from app.japanese_address import normalize_address, search_queries, result_accuracy


@pytest.mark.parametrize('address', [
    '神奈川県架空市テスト区検証町７－８－９',
    '神奈川県架空市テスト区検証町7-8-9',
    '神奈川県架空市テスト区検証町7丁目8番9号',
    '神奈川県架空市テスト区検証町七丁目8番地9号',
    '神奈川県 架空市 テスト区 検証町 7 － 8 ー 9',
    '〒000-0000 神奈川県架空市テスト区検証町7丁目8-9',
    '神奈川県架空市テスト区検証町 七 丁目 8 番 9 号',
])
def test_equivalent_address_forms(address):
    assert normalize_address(address) == '神奈川県架空市テスト区検証町7-8-9'


@pytest.mark.parametrize('original,expected', [
    ('三重県四日市市一番町 センター1ー2ー3', '三重県四日市市一番町センター1-2-3'),
    ('東京都テスト二十一丁目1番2号', '東京都テスト21-1-2'),
    ('東京都テスト1-2-3 ABC Tower', '東京都テスト1-2-3 ABC Tower'),
    ('京都府京都市上京区一番町', '京都府京都市上京区一番町'),
])
def test_names_and_meaning_are_preserved(original, expected):
    assert normalize_address(original) == expected


def test_queries_are_bounded_and_do_not_strip_building_names():
    queries = search_queries('東京都架空市テスト区検証町1-2-3')
    assert queries == [('東京都架空市テスト区検証町1-2-3', False), ('東京都架空市テスト区検証町1丁目2番3号', False), ('東京都, 架空市テスト区検証町1丁目', True)]
    assert len(search_queries('京都府京都市一番町 ABC Tower')) == 1


@pytest.mark.parametrize('row,expected', [
    ({'addresstype':'house', 'address':{'house_number':'1-2-3'}}, 'building'),
    ({'addresstype':'house'}, 'unknown'),
    ({'addresstype':'quarter'}, 'town'),
    ({'addresstype':'city'}, 'municipality'),
    ({'importance':1, 'place_rank':30}, 'unknown'),
])
def test_precision_requires_provider_evidence(row, expected):
    assert result_accuracy(row) == expected


@pytest.mark.parametrize('address', ['京都府京都市テスト百二丁目', '京都府京都市テスト一万丁目'])
def test_unsupported_kanji_units_are_not_partially_rewritten(address):
    assert normalize_address(address) == address


def test_four_number_sections_are_not_misread_as_chome_block_house():
    assert search_queries('東京都テスト1-2-3-4') == [('東京都テスト1-2-3-4', False)]
    assert search_queries('スタジオ1-2-3') == [('スタジオ1-2-3', False)]
