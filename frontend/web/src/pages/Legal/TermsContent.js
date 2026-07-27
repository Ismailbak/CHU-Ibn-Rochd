import React from 'react';
import { Link } from 'react-router-dom';

function TermsContent({ privacyLink = true }) {
  const privacyRef = privacyLink ? (
    <Link to="/privacy">Politique de confidentialité</Link>
  ) : (
    <strong>Politique de confidentialité</strong>
  );

  return (
    <>
      <p className="legal-notice">
        Les présentes conditions régissent l&apos;accès et l&apos;utilisation de la plateforme
        <strong> SmartHos</strong>, déployée au sein de l&apos;établissement de santé hôte —
        Service de Rhumatologie. Elles s&apos;adressent exclusivement au personnel autorisé et
        aux utilisateurs professionnels habilités.
      </p>

      <section>
        <h2>1. Objet et acceptation</h2>
        <p>
          SmartHos est une application d&apos;aide à la gestion du dossier patient et d&apos;assistance
          par intelligence artificielle, destinée à un usage professionnel dans un établissement de
          santé. En créant un compte ou en accédant au service, vous déclarez avoir pris connaissance
          des présentes conditions générales d&apos;utilisation (CGU) et de la{' '}
          {privacyRef}, et les accepter sans réserve.
        </p>
        <p>
          Si vous n&apos;acceptez pas ces conditions, vous devez cesser toute utilisation de la
          plateforme et en informer l&apos;administration de l&apos;établissement.
        </p>
      </section>

      <section>
        <h2>2. Éditeur et responsable du service</h2>
        <p>
          <strong>Éditeur / Exploitant :</strong> l&apos;établissement de santé hôte —
          Service de Rhumatologie, Royaume du Maroc.
        </p>
        <p>
          <strong>Contact :</strong> pour toute question relative aux présentes conditions,
          adressez-vous à <strong>l&apos;administration de l&apos;établissement</strong>.
        </p>
        <p>
          <strong>Administrateur technique :</strong> équipe informatique désignée par
          l&apos;établissement hôte. Les modalités d&apos;habilitation et de support interne sont
          définies par la politique SI de l&apos;établissement.
        </p>
      </section>

      <section>
        <h2>3. Description du service</h2>
        <p>SmartHos permet notamment :</p>
        <ul>
          <li>la consultation et la gestion des dossiers patients (identité, antécédents, actes, rendez-vous, résultats) ;</li>
          <li>la saisie et le suivi des actes médicaux et traitements ;</li>
          <li>la communication interne entre professionnels (notifications) ;</li>
          <li>l&apos;assistance par un module d&apos;IA générative entraîné pour répondre à des questions médicales et synthétiser des dossiers, sur la base des données disponibles dans le système.</li>
        </ul>
        <p>
          Le service est hébergé <strong>on-premise</strong> (infrastructure locale de
          l&apos;établissement). Les données de santé ne sont pas destinées à être hébergées
          par des prestataires cloud publics sans autorisation expresse et conforme à la
          réglementation marocaine.
        </p>
      </section>

      <section>
        <h2>4. Conditions d&apos;accès et comptes utilisateurs</h2>
        <ul>
          <li>L&apos;accès est réservé aux professionnels de santé et au personnel autorisé par l&apos;administration (médecins, personnels paramédicaux, administrateurs désignés).</li>
          <li>Chaque utilisateur dispose d&apos;identifiants personnels et confidentiels. Le partage de compte est strictement interdit.</li>
          <li>L&apos;utilisateur s&apos;engage à fournir des informations exactes lors de l&apos;inscription et à signaler toute compromission de ses identifiants sans délai.</li>
          <li>L&apos;établissement se réserve le droit de suspendre ou supprimer un compte en cas de violation des CGU, de la déontologie médicale ou des politiques internes.</li>
        </ul>
        <h3>4.1 Mot de passe oublié et réinitialisation</h3>
        <p>
          SmartHos ne propose pas de réinitialisation automatique par e-mail (service
          hébergé on-premise). En cas d&apos;oubli de mot de passe, l&apos;utilisateur peut :
        </p>
        <ul>
          <li>soumettre une demande via la page <strong>« Mot de passe oublié »</strong> accessible depuis l&apos;écran de connexion ;</li>
          <li>contacter l&apos;administration de l&apos;établissement ;</li>
          <li>obtenir une réinitialisation manuelle par un administrateur habilité (interface d&apos;administration).</li>
        </ul>
        <p>
          Après réinitialisation, l&apos;utilisateur doit modifier son mot de passe depuis son
          profil. Toute demande est tracée dans les journaux d&apos;audit à des fins de sécurité.
        </p>
      </section>

      <section>
        <h2>5. Usage autorisé et obligations de l&apos;utilisateur</h2>
        <p>L&apos;utilisateur s&apos;engage à :</p>
        <ul>
          <li>utiliser SmartHos uniquement dans le cadre de ses fonctions professionnelles et conformément au secret médical ;</li>
          <li>respecter la <strong>Loi n° 09-08</strong> relative à la protection des personnes physiques à l&apos;égard du traitement des données à caractère personnel, le <strong>Code de déontologie médicale (Loi n° 131-13)</strong> et les textes applicables au Maroc ;</li>
          <li>ne consulter que les dossiers patients pour lesquels il existe une justification professionnelle légitime ;</li>
          <li>ne pas extraire, copier ou diffuser des données patients en dehors des circuits autorisés par l&apos;établissement ;</li>
          <li>ne pas tenter de contourner les mesures de sécurité, d&apos;accéder à des espaces non autorisés ou d&apos;utiliser le système à des fins frauduleuses ;</li>
          <li>signaler sans délai toute faille de sécurité ou incident de confidentialité à l&apos;administration et, le cas échéant, au référent protection des données.</li>
        </ul>
      </section>

      <section>
        <h2>6. Assistant IA — limites et responsabilité professionnelle</h2>
        <p>
          Le module d&apos;assistance par intelligence artificielle constitue un <strong>outil
          d&apos;aide à la décision</strong>. Il ne se substitue en aucun cas au jugement
          clinique du médecin ni à un examen direct du patient.
        </p>
        <ul>
          <li>Les réponses générées peuvent contenir des erreurs, des omissions ou des informations incomplètes.</li>
          <li>L&apos;utilisateur doit <strong>vérifier systématiquement</strong> toute information avant de la utiliser pour une décision thérapeutique, diagnostique ou administrative.</li>
          <li>SmartHos ne constitue pas un dispositif médical certifié au sens des réglementations sur les dispositifs médicaux ; sa vocation est l&apos;organisation du dossier et l&apos;assistance documentaire.</li>
          <li>Les échanges avec l&apos;assistant peuvent être enregistrés à des fins de traçabilité, d&apos;audit et d&apos;amélioration du service, dans le respect de la politique de confidentialité.</li>
        </ul>
      </section>

      <section>
        <h2>7. Propriété intellectuelle</h2>
        <p>
          L&apos;interface, le code, la marque SmartHos, la documentation et les éléments
          graphiques sont protégés par le droit de la propriété intellectuelle. Toute
          reproduction, modification ou exploitation non autorisée est interdite.
        </p>
        <p>
          Les données cliniques saisies par les utilisateurs demeurent la propriété de
          l&apos;établissement de santé et/ou des patients, selon le cadre légal applicable.
        </p>
      </section>

      <section>
        <h2>8. Disponibilité et maintenance</h2>
        <p>
          L&apos;établissement et l&apos;équipe technique s&apos;efforcent d&apos;assurer une
          disponibilité continue du service. Des interruptions peuvent survenir pour maintenance,
          mise à jour de sécurité, ou cas de force majeure. Aucune garantie de disponibilité
          ininterrompue n&apos;est accordée.
        </p>
      </section>

      <section>
        <h2>9. Limitation de responsabilité</h2>
        <p>
          Dans les limites autorisées par la loi marocaine, la responsabilité de
          l&apos;établissement et des exploitants techniques ne saurait être engagée pour :
        </p>
        <ul>
          <li>les décisions cliniques prises par un professionnel sur la base d&apos;informations consultées ou suggérées par la plateforme ;</li>
          <li>les dommages résultant d&apos;une utilisation non conforme aux CGU ou en violation du secret médical ;</li>
          <li>les interruptions temporaires du service ou la perte de données imputable à un cas de force majeure, sous réserve des obligations légales de sauvegarde et de sécurité.</li>
        </ul>
        <p>
          Chaque professionnel de santé demeure responsable de ses actes conformément à la
          législation et à la déontologie en vigueur au Maroc.
        </p>
      </section>

      <section>
        <h2>10. Suspension et résiliation</h2>
        <p>
          L&apos;accès peut être suspendu ou résilié à tout moment en cas de manquement aux
          présentes CGU, sur décision de l&apos;administration ou de la direction de
          l&apos;établissement. La résiliation n&apos;affecte pas les obligations légales
          subsistantes (conservation des dossiers médicaux, secret professionnel, etc.).
        </p>
      </section>

      <section>
        <h2>11. Droit applicable et litiges</h2>
        <p>
          Les présentes CGU sont régies par le <strong>droit marocain</strong>. En cas de
          litige, et après tentative de règlement amiable, les tribunaux compétents de
          <strong> Casablanca</strong> seront seuls compétents, sous réserve des règles
          d&apos;ordre public.
        </p>
      </section>

      <section>
        <h2>12. Modifications</h2>
        <p>
          Les CGU peuvent être modifiées pour refléter l&apos;évolution du service ou des
          exigences légales. Les utilisateurs seront informés des changements substantiels
          par voie interne (notification, courriel professionnel ou affichage à la connexion).
          La poursuite de l&apos;utilisation vaut acceptation des CGU mises à jour.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          Pour toute question relative aux présentes conditions, contactez{' '}
          <strong>l&apos;administration de l&apos;établissement</strong>.
        </p>
      </section>

      <p className="legal-footer">
        Document établi pour SmartHos — Service de Rhumatologie.
        Validation par le service juridique de l&apos;établissement recommandée avant
        publication officielle.
      </p>
    </>
  );
}

export default TermsContent;
