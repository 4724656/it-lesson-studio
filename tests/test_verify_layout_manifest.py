#!/usr/bin/env python3
"""verify_layout.py 回归测试（必修1）：隔离导出时 manifest 传递。

验证：
1. worksheet_expected_pages() 能从显式传入的 lesson.yaml 读到 duplex=2 页；
2. 找不到 manifest 时回退为 single=1 页（而非崩溃或误判）。

运行：uv run python tests/test_verify_layout_manifest.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from verify_layout import worksheet_expected_pages, find_manifest

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "duplex-lesson", "lesson.yaml")


def test_duplex_manifest_returns_2():
    """duplex 版式的 lesson.yaml 应返回 2 页期望。"""
    expected = worksheet_expected_pages(FIXTURE)
    assert expected == 2, f"duplex 应期望 2 页，实际 {expected}"
    print("  [OK] duplex manifest → 期望 2 页")


def test_missing_manifest_defaults_to_1():
    """manifest 缺失/不可读时回退为 1 页（single 默认），不抛异常。"""
    assert worksheet_expected_pages(None) == 1
    assert worksheet_expected_pages("/nonexistent/lesson.yaml") == 1
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
        f.write("not: [valid, yaml: : :")
        bad = f.name
    try:
        assert worksheet_expected_pages(bad) == 1
    finally:
        os.unlink(bad)
    print("  [OK] 缺失/损坏 manifest → 回退 1 页")


def test_find_manifest_walks_up():
    """向上查找仍可用（非隔离导出场景）。"""
    d = os.path.dirname(FIXTURE)
    found = find_manifest(d)
    assert found == FIXTURE, f"向上查找应找到 {FIXTURE}，实际 {found}"
    print("  [OK] 向上查找 manifest 正常")


if __name__ == "__main__":
    test_duplex_manifest_returns_2()
    test_missing_manifest_defaults_to_1()
    test_find_manifest_walks_up()
    print("回归测试全部通过")
