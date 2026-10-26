"""共有TEMPを使えない環境でも、Git管理外の専用DBで再現可能に実行。"""
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

if __name__ == '__main__':
    root=Path(__file__).resolve().parent
    directory=root/'instance'/'test-runs'
    directory.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory(prefix='run-',dir=directory) as scratch:
        result=subprocess.run([sys.executable,'-m','pytest','-p','no:cacheprovider','--basetemp',scratch,*sys.argv[1:]],cwd=root)
    raise SystemExit(result.returncode)
