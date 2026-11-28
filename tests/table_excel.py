"""Compare a downloaded styled FDR workbook with all pages of the actual table."""
import base64, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

def assert_fdr_excel(page, path):
    path = Path(path)
    assert path.read_bytes().startswith(b'PK'), 'Expected a real Excel workbook'
    expected = page.evaluate('''() => {
      const old=FDR_PAGE, table=document.getElementById('fdr-table');
      const rows=[[...table.tHead.rows[0].cells].map(c=>c.innerText.trim())];
      for(let i=1;i<=Math.ceil(FDR_FILTERED.length/100);i++){
        FDR_PAGE=i;renderFdrModule();
        rows.push(...[...table.tBodies[0].rows].map(r=>[...r.cells].map(c=>c.innerText.trim())));
      }
      rows.push([...table.tFoot.rows[0].cells].map(c=>c.innerText.trim()));
      FDR_PAGE=old;renderFdrModule();return rows;
    }''')
    actual = page.evaluate('''encoded=>{
      const book=XLSX.read(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),{type:'array'});
      return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,raw:false,defval:'',blankrows:true});
    }''', base64.b64encode(path.read_bytes()).decode())
    assert actual == expected, 'Excel cell values/formatting/totals differ from the table'
    ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        styles=ET.fromstring(archive.read('xl/styles.xml'))
        sheet=ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        assert len(styles.find('s:fonts',ns))>1 and len(styles.find('s:fills',ns))>2
        assert len(styles.find('s:borders',ns))>1
        assert sheet.find('s:sheetViews/s:sheetView/s:pane',ns).get('xSplit')=='3'
    return actual
