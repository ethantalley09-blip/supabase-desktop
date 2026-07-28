import { Document, Page, pdf, StyleSheet, Text, View } from '@react-pdf/renderer';
import { saveFile } from '../download';
const styles = StyleSheet.create({
    page: { padding: 32, fontSize: 9 },
    title: { fontSize: 14, marginBottom: 12 },
    row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 3 },
    header: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', paddingVertical: 3 },
    cell: { flex: 1, paddingRight: 4 },
    headerCell: { flex: 1, paddingRight: 4, fontFamily: 'Helvetica-Bold' }
});
function TableDoc({ title, rows }) {
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return (<Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.header}>
          {columns.map((col) => (<Text key={col} style={styles.headerCell}>
              {col}
            </Text>))}
        </View>
        {rows.map((row, i) => (<View key={i} style={styles.row}>
            {columns.map((col) => (<Text key={col} style={styles.cell}>
                {String(row[col] ?? '')}
              </Text>))}
          </View>))}
        {rows.length === 0 && <Text>No data.</Text>}
      </Page>
    </Document>);
}
export async function exportPdf(filename, title, rows) {
    const blob = await pdf(<TableDoc title={title} rows={rows}/>).toBlob();
    await saveFile(filename, blob);
}
