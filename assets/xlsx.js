
const Xlsx = (() => {

  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    const parts = [], central = [];
    let offset = 0;

    for (const f of files) {
      const name = enc.encode(f.name);
      const data = enc.encode(f.data);
      const crc = crc32(data);

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);          // version needed
      lh.setUint16(6, 0x0800, true);      // flag : noms en UTF-8
      lh.setUint16(8, 0, true);           // méthode : stored
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);          // version made by
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);

      offset += 30 + name.length + data.length;
    }

    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);

    return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const x = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

  function colName(n) {           // 1 → A, 27 → AA
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
    return s;
  }

  function excelDate(iso) {
    if (!iso) return null;
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return null;
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/>
<numFmt numFmtId="165" formatCode="0.00%"/>
<numFmt numFmtId="166" formatCode="dd/mm/yyyy"/>
</numFmts>
<fonts count="3">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1B3A5C"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF808080"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const STYLE_OF = { text: 0, eur: 2, pct: 3, date: 4, num: 5 };
  const BOLD_OF  = { text: 6, eur: 7, pct: 8, date: 6, num: 6 };

  function sheetXml(cols, rows, total) {
    const all = total ? [...rows, total] : rows;

    const cell = (v, ci, ri, bold) => {
      const ref = colName(ci + 1) + ri;
      const type = cols[ci].t || 'text';
      const s = bold ? BOLD_OF[type] : STYLE_OF[type];
      if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
      if (type === 'date') {
        const n = excelDate(v);
        return n === null
          ? `<c r="${ref}" s="${bold ? 6 : 0}" t="inlineStr"><is><t>${x(v)}</t></is></c>`
          : `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
      }
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${bold ? 6 : 0}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    };

    const head = `<row r="1" ht="28" customHeight="1">` +
      cols.map((c, i) => `<c r="${colName(i + 1)}1" s="1" t="inlineStr"><is><t>${x(c.h)}</t></is></c>`).join('') +
      `</row>`;

    const body = all.map((r, ri) => {
      const isTotal = total && ri === all.length - 1;
      return `<row r="${ri + 2}">` + cols.map((_, ci) => cell(r[ci], ci, ri + 2, isTotal)).join('') + `</row>`;
    }).join('');

    const lastCol = colName(cols.length);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || 14}" customWidth="1"/>`).join('')}</cols>
<sheetData>${head}${body}</sheetData>
<autoFilter ref="A1:${lastCol}${rows.length + 1}"/>
</worksheet>`;
  }

  function build(sheets) {
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` },

      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },

      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) =>
  `<sheet name="${x(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>` },

      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },

      { name: 'xl/styles.xml', data: STYLES },

      ...sheets.map((s, i) => ({
        name: `xl/worksheets/sheet${i + 1}.xml`,
        data: sheetXml(s.cols, s.rows, s.total),
      })),
    ];

    return zip(files);
  }

  function save(filename, sheets) {
    const blob = build(sheets);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return { build, save };
})();
