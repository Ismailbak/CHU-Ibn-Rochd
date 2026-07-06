import React from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import './LegalPage.css';

function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <div className="legal-container">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>
          <FiArrowLeft /> Retour
        </button>

        <h1>Politique de confidentialité</h1>
        <p className="last-updated">Dernière mise à jour : 6 juillet 2026</p>

        <p className="legal-notice">
          La présente politique informe les utilisateurs professionnels de RhumatoAI sur la
          manière dont le Centre Hospitalo-Universitaire Ibn Rochd (CHU) — Service de
          Rhumatologie traite les données à caractère personnel, et notamment les{' '}
          <strong>données de santé</strong>, conformément à la{' '}
          <strong>Loi n° 09-08</strong> relative à la protection des personnes physiques à
          l&apos;égard du traitement des données à caractère personnel, promulguée par le
          Dahir n° 1-09-15 du 18 février 2009, et à son décret d&apos;application{' '}
          <strong>n° 2-09-165</strong>, ainsi qu&apos;aux orientations de la{' '}
          <strong>CNDP</strong> (Commission Nationale de contrôle de la protection des
          données à caractère personnel).
        </p>

        <section>
          <h2>1. Responsable du traitement</h2>
          <p>
            <strong>Responsable du traitement :</strong> Centre Hospitalo-Universitaire Ibn
            Rochd — Service de Rhumatologie, Casablanca, Royaume du Maroc.
          </p>
          <p>
            <strong>Contacts :</strong>
          </p>
          <ul>
            <li>
              Samy Housbane —{' '}
              <a href="mailto:s.housbane@gmail.com">s.housbane@gmail.com</a>
            </li>
            <li>
              Ismail Bakraoui —{' '}
              <a href="mailto:ismail.bakraoui0@gmail.com">ismail.bakraoui0@gmail.com</a>
            </li>
          </ul>
          <p>
            <strong>Référents protection des données :</strong> les contacts ci-dessus
            assurent le lien avec les utilisateurs pour toute question relative à la
            présente politique et aux droits des personnes concernées.
          </p>
          <p>
            Le traitement est effectué dans le cadre des missions de soins, de gestion
            administrative du service et d&apos;amélioration de la prise en charge des
            patients. Une déclaration ou autorisation auprès de la CNDP peut être requise
            selon la nature et la sensibilité des traitements ; l&apos;établissement s&apos;engage
            à respecter les formalités applicables.
          </p>
        </section>

        <section>
          <h2>2. Données collectées</h2>
          <p>Selon les fonctionnalités utilisées, RhumatoAI peut traiter les catégories de données suivantes :</p>

          <h3>2.1 Données des patients (données de santé)</h3>
          <ul>
            <li>identité et coordonnées (nom, prénom, date de naissance, sexe, adresse, téléphone, e-mail) ;</li>
            <li>identifiants médicaux (IPP, numéro de dossier) ;</li>
            <li>données cliniques : diagnostics, antécédents, allergies, notes médicales, actes, traitements, résultats d&apos;examens, rendez-vous ;</li>
            <li>documents médicaux téléversés (comptes rendus, pièces jointes) ;</li>
            <li>données d&apos;assurance le cas échéant.</li>
          </ul>

          <h3>2.2 Données des utilisateurs professionnels</h3>
          <ul>
            <li>identité professionnelle, spécialité, service, identifiants de connexion ;</li>
            <li>journalisation des actions (connexions, créations, modifications, suppressions) à des fins de sécurité et d&apos;audit ;</li>
            <li>historique des conversations avec l&apos;assistant IA liées à un dossier ou une session.</li>
          </ul>

          <h3>2.3 Données techniques</h3>
          <ul>
            <li>adresses IP, horodatages, logs serveur, identifiants de session ;</li>
            <li>données strictement nécessaires au fonctionnement et à la sécurité du système.</li>
          </ul>
        </section>

        <section>
          <h2>3. Finalités et bases légales du traitement</h2>
          <p>Les données sont traitées pour les finalités suivantes :</p>
          <ul>
            <li><strong>Prise en charge médicale</strong> — gestion du dossier patient, suivi rhumatologique, prescriptions et résultats ;</li>
            <li><strong>Organisation des soins</strong> — planification des rendez-vous et coordination du service ;</li>
            <li><strong>Assistance documentaire par IA</strong> — synthèse de dossiers et réponses fondées sur les données internes, sans remplacer l&apos;avis médical ;</li>
            <li><strong>Communication interne</strong> — notifications entre professionnels du service ;</li>
            <li><strong>Sécurité et conformité</strong> — authentification, traçabilité, prévention des accès non autorisés, respect des obligations légales ;</li>
            <li><strong>Amélioration du service</strong> — statistiques agrégées et anonymisées lorsque applicable.</li>
          </ul>
          <p>
            Les bases légales incluent l&apos;<strong>exécution d&apos;une mission d&apos;intérêt
            public</strong> (soins de santé), le <strong>consentement du patient</strong> lorsque
            requis pour des actes spécifiques, l&apos;<strong>obligation légale</strong> de
            conservation des dossiers médicaux, et l&apos;<strong>intérêt légitime</strong> de
            l&apos;établissement à sécuriser ses systèmes d&apos;information, dans le respect de
            la Loi 09-08.
          </p>
        </section>

        <section>
          <h2>4. Destinataires et hébergement</h2>
          <p>
            Les données sont hébergées sur l&apos;<strong>infrastructure locale</strong> de
            l&apos;établissement (serveurs on-premise au Maroc). Elles ne sont pas vendues ni
            cédées à des tiers à des fins commerciales.
          </p>
          <p>Accès limité à :</p>
          <ul>
            <li>le personnel soignant et administratif habilité du service ;</li>
            <li>les administrateurs système et techniques agissant sous contrôle de l&apos;établissement ;</li>
            <li>le cas échéant, les autorités compétentes sur réquisition légale.</li>
          </ul>
          <p>
            Le moteur d&apos;IA (Ollama) fonctionne sur un serveur dédié au sein du même
            environnement local. <strong>Aucune donnée patient n&apos;est transmise à des
            services d&apos;IA cloud publics</strong> (OpenAI, Google, etc.) dans la
            configuration de production décrite pour RhumatoAI.
          </p>
        </section>

        <section>
          <h2>5. Transferts hors du Maroc</h2>
          <p>
            Conformément à la Loi 09-08, tout transfert de données à caractère personnel vers
            un pays étranger requiert en principe une autorisation de la CNDP, sauf exceptions
            prévues par la loi. La configuration standard de RhumatoAI vise le{' '}
            <strong>traitement et le stockage au Maroc</strong>. Tout projet de transfert
            transfrontière devra faire l&apos;objet d&apos;une analyse préalable et des
            formalités CNDP requises.
          </p>
        </section>

        <section>
          <h2>6. Durées de conservation</h2>
          <ul>
            <li><strong>Dossiers médicaux :</strong> conservés conformément aux obligations légales et réglementaires applicables aux établissements de santé au Maroc (durées minimales de conservation des dossiers patients).</li>
            <li><strong>Comptes utilisateurs :</strong> conservés pendant la durée de la relation professionnelle et supprimés ou anonymisés après départ, selon la politique RH/SI de l&apos;établissement.</li>
            <li><strong>Journaux de connexion et d&apos;audit :</strong> conservés pour une durée proportionnée aux exigences de sécurité (généralement 12 à 36 mois, sauf obligation contraire).</li>
            <li><strong>Historique de chat IA :</strong> conservé pour la traçabilité clinique et technique ; durée alignée sur la politique de conservation des dossiers ou des logs internes.</li>
          </ul>
        </section>

        <section>
          <h2>7. Sécurité des données</h2>
          <p>
            L&apos;établissement met en œuvre des mesures techniques et organisationnelles
            appropriées au regard de la sensibilité des données de santé, notamment :
          </p>
          <ul>
            <li>authentification par identifiants personnels et mots de passe ;</li>
            <li>contrôle d&apos;accès basé sur les rôles (médecin, administrateur, etc.) ;</li>
            <li>chiffrement des communications sur le réseau interne lorsque applicable (HTTPS) ;</li>
            <li>segmentation réseau (serveurs applicatif, base de données, IA) ;</li>
            <li>sauvegardes régulières et procédures de restauration ;</li>
            <li>journalisation des accès et des actions sensibles.</li>
          </ul>
          <p>
            En cas de violation de données susceptible d&apos;engendrer un risque pour les
            personnes concernées, l&apos;établissement s&apos;engage à mettre en œuvre les
            notifications requises auprès de la CNDP et, le cas échéant, des personnes
            concernées, conformément à la réglementation applicable.
          </p>
        </section>

        <section>
          <h2>8. Droits des personnes concernées</h2>
          <p>
            Conformément à la Loi 09-08, les patients et, le cas échéant, les utilisateurs,
            disposent des droits suivants, dans les conditions et limites prévues par la loi
            (notamment lorsque le traitement répond à une obligation légale de conservation
            des dossiers médicaux) :
          </p>
          <ul>
            <li><strong>Droit d&apos;accès</strong> — obtenir la confirmation qu&apos;un traitement les concerne et en recevoir une copie ;</li>
            <li><strong>Droit de rectification</strong> — faire corriger des données inexactes ou incomplètes ;</li>
            <li><strong>Droit d&apos;opposition</strong> — s&apos;opposer, pour des motifs légitimes, à certains traitements non indispensables aux soins ;</li>
            <li><strong>Droit à l&apos;information</strong> — être informé des finalités et modalités du traitement (objet de la présente politique).</li>
          </ul>
          <p>
            Les demandes s&apos;exercent auprès des référents suivants :
          </p>
          <ul>
            <li>
              Samy Housbane —{' '}
              <a href="mailto:s.housbane@gmail.com">s.housbane@gmail.com</a>
            </li>
            <li>
              Ismail Bakraoui —{' '}
              <a href="mailto:ismail.bakraoui0@gmail.com">ismail.bakraoui0@gmail.com</a>
            </li>
          </ul>
          <p>
            Une réponse sera apportée dans un délai raisonnable, et au plus tard dans les
            délais prévus par la réglementation.
          </p>
          <p>
            En cas de difficulté non résolue, la personne concernée peut introduire une
            réclamation auprès de la <strong>CNDP</strong> :{' '}
            <a href="https://www.cndp.ma" target="_blank" rel="noopener noreferrer">www.cndp.ma</a>.
          </p>
        </section>

        <section>
          <h2>9. Cookies et traceurs</h2>
          <p>
            RhumatoAI utilise des mécanismes de session strictement nécessaires au
            fonctionnement (token d&apos;authentification stocké localement dans le navigateur).
            Aucun cookie publicitaire ou de profilage à des fins commerciales n&apos;est déployé
            dans la version on-premise destinée au personnel hospitalier.
          </p>
        </section>

        <section>
          <h2>10. Mineurs et incapacité</h2>
          <p>
            Les dossiers de patients mineurs ou protégés par la loi sont traités conformément
            aux règles applicables en matière de consentement du représentant légal et de
            secret médical. Seul le personnel habilité y accède dans le cadre des soins.
          </p>
        </section>

        <section>
          <h2>11. Modifications de la politique</h2>
          <p>
            Cette politique peut être mise à jour pour refléter l&apos;évolution du service,
            de l&apos;infrastructure ou des exigences de la CNDP. La date de dernière mise à
            jour figure en tête de document. Les changements substantiels seront portés à la
            connaissance des utilisateurs par les canaux internes appropriés.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            <strong>Protection des données et questions générales :</strong>
          </p>
          <ul>
            <li>
              Samy Housbane —{' '}
              <a href="mailto:s.housbane@gmail.com">s.housbane@gmail.com</a>
            </li>
            <li>
              Ismail Bakraoui —{' '}
              <a href="mailto:ismail.bakraoui0@gmail.com">ismail.bakraoui0@gmail.com</a>
            </li>
          </ul>
        </section>

        <p className="legal-footer">
          Document établi pour RhumatoAI — usage professionnel CHU Ibn Rochd. Il complète
          les politiques internes de l&apos;établissement et ne dispense pas d&apos;une
          déclaration ou autorisation CNDP le cas échéant. Validation juridique recommandée
          avant publication officielle.
        </p>
      </div>
    </div>
  );
}

export default PrivacyPage;
