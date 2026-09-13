import { Modal } from './Modal';
import { useT } from '../../i18n';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InfoModal({ isOpen, onClose }: InfoModalProps) {
  const t = useT();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Über den Dokumentenraum')}>
      <div className="max-h-[70vh] overflow-y-auto pr-2 -mr-2 text-gray-700 text-sm leading-relaxed space-y-4">
        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t('Was ist der Dokumentenraum?')}</h3>
          <p>
            {t(
              'Der Dokumentenraum ist eine digitale Lernumgebung zur multimodalen Dokumentation im Mathematikunterricht. Die App ermöglicht es, vielfältige Eigenproduktionen von Kindern – Fotos, Videos, Audioaufnahmen, Zeichnungen und Texte – auf einem digitalen Canvas zu sammeln, zu organisieren und zu präsentieren.'
            )}
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t('Fachdidaktischer Hintergrund')}</h3>
          <p>
            {t(
              'Die Konzeption basiert auf der Theorie der substanziellen Lernumgebungen nach Wollring (2008) und verbindet etablierte Prinzipien des aktiv-entdeckenden und sozialen Lernens (Wittmann, 1997) mit den Möglichkeiten digitaler Dokumentation.'
            )}
          </p>
          <p className="mt-2">
            {t(
              'Im Zentrum steht das Konzept der Eigenproduktionen (Treffers, 1983; Selter, 1993): Dokumente zu Ergebnissen, Vorgehensweisen und Strategien von Kindern beim Bearbeiten mathematischer Probleme. Diese dienen der Planung, Diagnostik, als Grundlage für Meta-Aufgaben und der sukzessiven Aneignung von Lernumgebungen.'
            )}
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t('Spiel-Raum und Dokumenten-Raum')}</h3>
          <p>
            {t(
              'Nach Wollring (2008) und Komm & Huhmann (2022) benötigt eine gelungene Lernumgebung sowohl einen „Spiel-Raum" für flexible, flüchtige Handlungen als auch einen „Dokumenten-Raum" zum dauerhaften Behalten.'
            )}
          </p>
          <p className="mt-2">
            {t(
              'Der Spiel-Raum eröffnet Möglichkeiten, mit Repräsentanten mathematischer Objekte handelnd tätig zu sein und dabei im Handeln zu reflektieren. Er ist durch die Darstellungsflüchtigkeit der Handlungen gekennzeichnet.'
            )}
          </p>
          <p className="mt-2">
            {t(
              'Im Dokumenten-Raum werden Handlungsprozesse und -produkte nicht-flüchtig dargestellt, wodurch zur Reflexion über das Handeln angeregt wird.'
            )}
          </p>
          <p className="mt-2">
            {t(
              'Die digitale Umsetzung ermöglicht eine wechselseitige Verbindung beider Räume: Dokumentationen können dynamisiert werden und als neue mathematische Objekte Möglichkeiten für weitere Handlungen im Spiel-Raum bieten – ein kontinuierlicher Kreislauf aus Dokumentieren und Dynamisieren.'
            )}
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t('Mathematiktreiben und Reflektieren')}</h3>
          <p>
            {t(
              '„So wie Musik erklingt, wenn sie gespielt wird, entsteht Mathematik, indem sie im Prozess des Mathematiktreibens denkend und konkret handelnd erlebt wird" (Komm & Huhmann, 2022). Die App unterstützt dieses aktive Mathematiktreiben durch:'
            )}
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
            <li>{t('Flexibles Ordnen, Sortieren und Strukturieren von Dokumentationseinheiten')}</li>
            <li>{t('Wiederholtes Wahrnehmen und (Re-)Strukturieren im Sinne einer Reflexion')}</li>
            <li>{t('Erkennen und erneutes Fokussieren durch räumliche Anordnung')}</li>
            <li>{t('Erklären für sich selbst und andere durch verschiedene Medien')}</li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t('Anerkennungskultur')}</h3>
          <p>
            {t(
              'Die App unterstützt eine Unterrichtskultur der Anerkennung (Prengel, 2004), indem Teilleistungen und unterschiedliche Lösungsansätze gleichberechtigt dargestellt werden können. Die kompetenzorientierte Sicht auf Beiträge der Kinder stärkt das mathematische Selbstkonzept.'
            )}
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t('Einsatzmöglichkeiten')}</h3>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>{t('Dokumentation:')}</strong> {t('Sammeln von Eigenproduktionen während offener Aufgabenstellungen')}
            </li>
            <li>
              <strong>{t('Präsentation:')}</strong> {t('Gemeinsames Betrachten und Vergleichen unterschiedlicher Lösungswege')}
            </li>
            <li>
              <strong>{t('Diagnostik:')}</strong> {t('Analyse von Strategien und Denkwegen für handlungsleitende Förderung')}
            </li>
            <li>
              <strong>{t('Reflexion:')}</strong> {t('Rückblick auf Lernprozesse durch (Re-)Strukturierung der Dokumente')}
            </li>
            <li>
              <strong>{t('Vorbereitung:')}</strong> {t('Strukturierung durch vorbereitete Analyseumgebungen für Kinder')}
            </li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t('Buch-Modus')}</h3>
          <p>
            {t(
              'Neben der Pinnwand gibt es den Buch-Modus: Kinder gestalten Seite für Seite ein eigenes Buch mit Texten, Fotos, Zeichnungen, Sprachaufnahmen und Videos – ähnlich wie in Book Creator. Elemente werden angetippt, verschoben und an den Ecken vergrößert. Im Präsentationsmodus lässt sich das Buch blättern und vorlesen, und es kann als PDF gespeichert werden. Karten von einer Pinnwand können direkt in ein Buch übernommen werden.'
            )}
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t('Teilen-Funktion')}</h3>
          <p>
            {t(
              'Mit der Teilen-Funktion können vorstrukturierte Projekte (Name und Bereiche) per QR-Code oder Link geteilt werden. So können Lehrkräfte Lernumgebungen vorbereiten und an Kinder weitergeben – die Karten werden dabei nicht übertragen, sodass jedes Kind seine eigenen Eigenproduktionen erstellen kann.'
            )}
          </p>
        </section>

        <section className="bg-green-50 border border-green-200 rounded-lg p-3">
          <h3 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            {t('Datenschutz & Offline-Nutzung')}
          </h3>
          <p className="text-green-800">
            {t(
              'Alle Daten werden ausschließlich lokal auf dem verwendeten Gerät (z.B. iPad, Tablet oder Computer) gespeichert. Es werden keine Daten über das Internet übertragen oder auf externen Servern gespeichert.'
            )}
          </p>
          <p className="mt-2 text-green-800">
            {t(
              'Die App kann als Progressive Web App (PWA) installiert und anschließend vollständig ohne Internetverbindung genutzt werden – ideal für den Einsatz im Klassenzimmer ohne WLAN.'
            )}
          </p>
          <p className="mt-2 text-green-700 text-xs">
            {t(
              'Hinweis: Da alle Daten lokal gespeichert werden, sind sie nur auf dem jeweiligen Gerät verfügbar. Bei Nutzung auf mehreren Geräten müssen Projekte über die Teilen-Funktion übertragen werden.'
            )}
          </p>
        </section>

        <section className="pt-2 border-t border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-2">{t('Literatur')}</h3>
          <p className="text-xs text-gray-600 space-y-1">
            <span className="block">Komm, E. &amp; Huhmann, T. (2022). Mathematiktreiben und Reflektieren – Entdecken dokumentieren, um neu zu entdecken. In: Gläser, E. et al. (Hrsg.): Reflexion und Reflexivität im Kontext Grundschule, S. 251-257.</span>
            <span className="block">Prengel, A. (2004). Anerkennung in der integrativen Grundschulpädagogik.</span>
            <span className="block">Selter, Ch. (1993). Eigenproduktionen im Arithmetikunterricht der Primarstufe.</span>
            <span className="block">Treffers, A. (1983). Fortschreitende Schematisierung.</span>
            <span className="block">Wittmann, E.Ch. (1997). Aktiv-entdeckendes und soziales Lernen.</span>
            <span className="block">Wollring, B. (2008). Zur Kennzeichnung von Lernumgebungen für den Mathematikunterricht in der Grundschule.</span>
          </p>
        </section>
      </div>
    </Modal>
  );
}
