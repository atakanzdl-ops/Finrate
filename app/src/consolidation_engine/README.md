# Finrate Consolidation Engine

Python tabanli, explainable bir konsolidasyon motoru.

## Neler Yapar
- Kontrol bazli kapsam siniflandirmasi (`full`, `equity`, `financial_asset`)
- Etkin sahiplik hesaplama (dolayli/multipl path, cycle-safe)
- Gross consolidation (%100 dahil)
- Sermaye eliminasyonu (yatirim hesabi vs istirak ozkaynak)
- Grup ici eliminasyonlar (RP, satis, faiz, temettu, stok karlari, duran varlik karlari)
- Azinlik payi hesaplama
- Equity method hesaplama
- Finrate score engine input normalizasyonu
- Audit log + warning odakli hata toleransi

## Paket Yapisi
- `models.py`
- `ownership_engine.py`
- `scope_detection.py`
- `gross_consolidation.py`
- `elimination_engine.py`
- `capital_elimination_helper.py`
- `minority_interest_calculator.py`
- `equity_method_calculator.py`
- `score_mapping_helper.py`
- `orchestration.py`
- `tests/test_consolidation_engine.py`

## Kullanim
```python
import json
from consolidation_engine import ConsolidationEngine

with open("consolidation_engine/examples/input.json", "r", encoding="utf-8") as f:
    payload = json.load(f)

engine = ConsolidationEngine()
result = engine.run(payload)
print(json.dumps(result, indent=2, ensure_ascii=False))
```

## Test
```bash
python -m unittest consolidation_engine.tests.test_consolidation_engine
```

