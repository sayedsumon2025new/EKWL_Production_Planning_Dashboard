"""Build the reviewed schema/catalog. Runtime never accepts arbitrary table names."""
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
V='VARCHAR(255)'; ID='VARCHAR(36)'; I='BIGINT'; D='DECIMAL(24,8)'; J='LONGTEXT'; T='TEXT'
catalog={}
def table(name,cols,pk='id',read=None,write=None,unique=None):
    catalog[name]={'columns':cols,'pk':pk.split(','),'read':read or [],'write':write,'unique':unique or []}
common={'id':'BIGINT AUTO_INCREMENT','uploaded_by':ID,'uploaded_at':'DATETIME(6)'}
table('site_users',{'id':'BIGINT AUTO_INCREMENT','auth_user_id':ID,'email':V,'role':'VARCHAR(16)','status':'VARCHAR(16)','permissions':J,'created_at':'DATETIME(6)'},read=['self'],write=None,unique=[['auth_user_id'],['email']])
table('plan_uploads',{'id':ID,'file_name':T,'row_count':I,'status':'VARCHAR(20)','planning_month':'DATE','sequence_no':I,'planning_id':V,'uploaded_at':'DATETIME(6)','uploaded_by':ID,'revision':I,'expected_daily_rows':I},read=['home'],write='planning_upload')
plan={k:V for k in 'line_no buyer product_type product ewo stroke po col print emb outsource criteria'.split()}
plan.update({k:D for k in 'order_qty planned_qty strip_plan_qty manpower smv average total'.split()})
plan.update({k:'DATE' for k in 'pcd psd pfd delivery'.split()})
plan.update({'id':'BIGINT AUTO_INCREMENT','upload_id':ID,'source_row':I,'is_summary_row':'TINYINT(1)'})
table('plan_records',plan,read=['home'],write='planning_upload',unique=[['upload_id','source_row']])
table('plan_daily',{'id':'BIGINT AUTO_INCREMENT','upload_id':ID,'record_id':I,'plan_date':'DATE','value':D},read=['home'],write='planning_upload',unique=[['record_id','plan_date']])
fields='buyer ewo color_name item_product_type style_embellishment_type pattern_update status cutting_difficulties'.split()
fab={k:V for k in fields};fab.update({k:D for k in 'color_order_qty fabric_booking_qty total_fabric_received fabric_balance fabric_stock_after_cut cutable_qty total_cut_qty cutting_balance cutting_percent'.split()});fab.update({k:'DATE' for k in ['pattern_received_date','replacement_receive_commitment_date']})
table('fabric_cutting_info',dict(common,**fab),read=['slide_7','slide_11','slide_21'],write='fabric')
sew={k:V for k in 'ewo color line line_no po_no'.split()};sew.update({k:D for k in 'order_qty total_input_qty total_output_qty total_wip_qty total_reject_qty'.split()})
table('sewing_input_output',dict(common,**sew),read=['slide_7','slide_11','slide_21'],write='sewing')
prod={k:V for k in 'code buyer ewo po_no color line line_no'.split()};prod.update({'output_date':'DATE','total_qty':D})
table('date_wise_production',dict(common,**prod),read=['slide_7','slide_21'],write='production')
for name,extra,pk in [
 ('efficiency_run_day_ladder',dict(item=V,**{k:D for k in ['day_1','day_2','day_3','day_4','day_5','day_6_plus']}),'item'),
 ('line_chassis_priority',{'line_no':I,'priority_order':I,'product_name':V},'line_no,priority_order'),
 ('abp_target',{'parameter_name':V,'target_value':D,'config':J,'updated_at':'DATETIME(6)'},'parameter_name'),
 ('dashboard_master_settings',{'setting_key':V,'setting_value':T,'updated_at':'DATETIME(6)'},'setting_key'),
 ('slide4_chassis_strength',{'item_name':V,'line_strength':D,'updated_at':'DATETIME(6)'},'item_name'),
 ('floor_allocation',{'line_no':I,'level':V,'ie_name_line_block':V,'employee_id':V,'updated_at':'DATETIME(6)'},'line_no')]:
 table(name,extra,pk,read=['home'],write='admin_settings')
for name,slide in [('size_set_rows',17),('accessories_rows',18),('embellishment_send_receive_rows',19)]:
 cols=dict(common,batch_id=ID,source_row_no=I,file_name=T,is_active='TINYINT(1)')
 if slide!=19:cols['row_data']=J
 if slide==18:cols['report_date']=V
 else:
  names=['Code','Date','EWO No','Style No','Buyer','Buyer Team','Color','Order Qty','Today Print Send Qty\n','Total Print Send Qty\n',' Today Print Receive Qty','Total Print Receive Qty','Today Print Return Qty','Total Print Return Qty','Today EMB Send Qty','Total EMB Send Qty','Today EMB Receive Qty','Total EMB Receive Qty','Today EMB Return Qty','Total EMB Return Qty','csv_column_21']
  cols.update({k:T for k in names})
 table(name,cols,read=[f'slide_{slide}','slide_7','slide_21']+(['slide_11'] if slide==19 else []),write='embellishment_upload' if slide==19 else 'admin',unique=[['batch_id','source_row_no']])
table('order_bank_upload_batches',{'id':'BIGINT AUTO_INCREMENT','file_name':T,'uploaded_at':'DATETIME(6)','uploaded_by':ID,'raw_rows':I,'nonblank_rows':I,'status':V,'source_columns':J,'note':T,'upload_token':ID},read=['slide_14','slide_16','slide_7'],write=None,unique=[['upload_token']])
cols={k:T for k in 'Code Buyer Dept EWO PO GmtColor EWO&Color Stroke Description Destination TechPackDate FOB RevisedFOB EFD FRDate CostingSMV UpdatedSMV TotalHour FRHour OrderQty OrderRate Ordervalue Season ContractNo ContractUnit ExecutionUnit Gender ConsumptionQtyInHouse ConsumptionQtyOutSource FabrickgInHouse FabrickgOutSource TotalFabricinKG Ordertype OrderStatus TNADays MMTeam CancelReason Remarks Month'.split()}
table('order_bank_raw',dict(cols,id='BIGINT AUTO_INCREMENT',upload_batch_id=I,source_row_no=I,source_data=J),read=['slide_14','slide_16','slide_7'],write=None,unique=[['upload_batch_id','source_row_no']])
table('order_bank_import_rows',{'upload_token':ID,'source_row_no':I,'source_data':J,'uploaded_by':ID,'created_at':'DATETIME(6)'},'upload_token,source_row_no',read=['admin'],write='admin')
# Include every field emitted by the existing three CSV upload mappers.
source=(ROOT/'dashboard-main.js').read_text()
for fn,name in [('uploadFabricCutting','fabric_cutting_info'),('uploadSewingIO','sewing_input_output'),('uploadDateWiseProduction','date_wise_production')]:
 block=source[source.index('async function '+fn+'('):]
 block=block[:block.index('\n}')]
 for key,expr in re.findall(r'^\s+(\w+):([^\n]+)',block,re.M):
  if key in ['contentType','upsert']:continue
  kind=D if 'csvNum(' in expr else 'DATE' if 'fcDate(' in expr or 'dwpDate(' in expr else 'TIME' if 'fcTime(' in expr else I if key=='source_row' else V
  catalog[name]['columns'].setdefault(key,kind)
for name in ['fabric_cutting_info','sewing_input_output','date_wise_production']:
 catalog[name]['columns']['report_batch_id']=ID
# Source-dependent derived SQL is deliberately not represented as a stored fake snapshot.
for spec in catalog.values():
 spec['storage_names']={key:'source_field_'+str(i) for i,key in enumerate(spec['columns']) if key!=key.rstrip() or '\n' in key or key.startswith(' ')}
(ROOT/'backend/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
def q(s):return '`'+s.replace('`','``')+'`'
sql=['-- Staging only. No DROP statements. Prefix isolates existing Notes tables.','SET NAMES utf8mb4;','SET time_zone = \'+00:00\';']
for name,c in catalog.items():
 defs=[]
 for col,kind in c['columns'].items():
  required=col in c['pk']
  if col=='id' and kind==ID:kind+=' NOT NULL'
  elif required or 'AUTO_INCREMENT' in kind:kind+=' NOT NULL'
  else:kind+=' NULL'
  defs.append(q(c['storage_names'].get(col,col))+' '+kind)
 defs.append('PRIMARY KEY ('+','.join(map(q,c['pk']))+')')
 defs += ['UNIQUE KEY '+q('uq_'+str(i))+' ('+','.join(map(q,keys))+')' for i,keys in enumerate(c['unique'])]
 sql.append('CREATE TABLE IF NOT EXISTS '+q('ekwl_'+name)+' (\n  '+',\n  '.join(defs)+'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;')
(ROOT/'database/mysql/schema.sql').write_text('\n\n'.join(sql)+'\n')
