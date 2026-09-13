// Eingebaute Vorlagen (statische PNGs unter public/templates/), wie in der iOS-App

export interface BuiltinTemplate {
  file: string;
  name: string;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { file: 'Zahlenstrahl_0_bis_100.png', name: 'Zahlenstrahl 0 bis 100' },
  { file: 'Sortieren_oben_unten.png', name: 'Sortieren: oben und unten' },
  { file: 'Sortieren_mehr_weniger.png', name: 'Sortieren: weniger und mehr' },
  { file: 'Rechenwege_Start_Weg_Ergebnis.png', name: 'Rechenwege: Start, Weg, Ergebnis' },
  { file: 'Stellenwerttafel_H_Z_E.png', name: 'Stellenwerttafel H Z E' },
  { file: 'Teil_Ganzes_Modell.png', name: 'Teil-Ganzes-Modell' },
  { file: 'Venn_Diagramm.png', name: 'Venn-Diagramm' },
  { file: 'Lernweg_1_2_3_4.png', name: 'Lernweg 1-2-3-4' },
  { file: 'Forscherfrage_Vermutung_Beobachtung.png', name: 'Forschen: Frage, Vermutung, Beobachtung' },
  { file: 'Wortschatz_Nomen_Verben_Adjektive.png', name: 'Wortschatz: Nomen, Verben, Adjektive' },
  { file: 'Lesen_Figur_Ort_Problem_Loesung.png', name: 'Geschichte: Figur, Ort, Problem, Lösung' },
  { file: 'Ich_weiss_Ich_frage_Ich_lerne.png', name: 'Ich weiß, ich frage, ich lerne' },
  { file: 'Ampel_Einschaetzung.png', name: 'Ampel-Einschätzung' },
  { file: 'Tabelle_Vergleichen.png', name: 'Vergleichen' },
  { file: '4_Bereiche.png', name: 'Vier Felder' },
  { file: 'Skala.png', name: 'Skala 0 bis 10' },
  { file: 'Skala_ansteigend.png', name: 'Ansteigende Skala' },
  { file: 'Zeitstrahl.png', name: 'Zeitstrahl' },
];

export function templateUrl(t: BuiltinTemplate): string {
  return `${import.meta.env.BASE_URL}templates/${t.file}`;
}
