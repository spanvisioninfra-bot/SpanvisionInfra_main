"""One geometry conversion per subprocess; no web state or credentials are used."""
import json
import sys
from dataclasses import asdict
from pathlib import Path
from .ifc_processor import IFCProcessor

def main():
    ifc_path, output_dir, output_name, output_format, result_path = sys.argv[1:]
    result = IFCProcessor(Path(output_dir)).process(ifc_path, output_name, output_format)
    Path(result_path).write_text(json.dumps(asdict(result), allow_nan=False), encoding='utf-8')

if __name__ == '__main__':
    main()
