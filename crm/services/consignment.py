"""Public facade for pharmacy consignment, product traction, EWS raw materials,
and sales attendance services.
"""
from crm.services.consignment_pharmacy import (
    _deduct_warehouse_stock,
    _return_warehouse_stock,
    pharmacy_consignment_overview,
    record_consignment_visit,
)
from crm.services.consignment_seed import seed_consignment_and_alarms
from crm.services.product_traction import (
    product_traction_analysis,
    save_carry_directive,
)
from crm.services.raw_materials import raw_material_alerts, save_raw_material
from crm.services.sales_attendance import DAY_NAMES_ID, sales_attendance_recap

__all__ = [
    'DAY_NAMES_ID',
    'pharmacy_consignment_overview',
    'product_traction_analysis',
    'raw_material_alerts',
    'record_consignment_visit',
    'sales_attendance_recap',
    'save_carry_directive',
    'save_raw_material',
    'seed_consignment_and_alarms',
]
