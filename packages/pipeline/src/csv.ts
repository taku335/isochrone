export type CsvRecord = Readonly<Record<string, string>>;

export function parseCsvRecords(
  text: string,
  fileName: string,
  requiredColumns: readonly string[],
): CsvRecord[] {
  const rows = [...parseCsvRows(stripBom(text))];
  if (rows.length === 0) {
    throw new Error(`GTFS file is empty: ${fileName}`);
  }

  const header = rows[0];
  if (header === undefined || header.length === 0) {
    throw new Error(`GTFS file has no header: ${fileName}`);
  }

  for (const column of requiredColumns) {
    if (!header.includes(column)) {
      throw new Error(`GTFS file ${fileName} is missing required column: ${column}`);
    }
  }

  return rows.slice(1).filter(hasAnyValue).map((row) => toRecord(header, row));
}

function* parseCsvRows(text: string): Generator<readonly string[]> {
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const next = text.charAt(index + 1);

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(field);
      yield row;
      field = '';
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    yield row;
  }
}

function toRecord(header: readonly string[], row: readonly string[]): CsvRecord {
  const record: Record<string, string> = {};
  header.forEach((column, index) => {
    record[column] = row[index] ?? '';
  });
  return record;
}

function hasAnyValue(row: readonly string[]): boolean {
  return row.some((field) => field.length > 0);
}

function stripBom(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}
