-- Fix mojibake in reference catalog labels (UTF-8 import corruption).
-- Safe to re-run: sets canonical French labels by stable code keys.

UPDATE ref_care_types SET
  label = 'Rhumatismes Inflammatoires Chroniques',
  description = 'Consultation pour rhumatismes inflammatoires chroniques'
WHERE code = 'RIC';

UPDATE ref_care_types SET
  label = 'Rhumatismes Dégénératifs',
  description = 'Consultation pour rhumatismes dégénératifs (arthroses)'
WHERE code = 'RD';

UPDATE ref_care_types SET
  label = 'Pathologie Osseuse',
  description = 'Consultation pour pathologies osseuses (ostéoporose, etc)'
WHERE code = 'OS';

UPDATE ref_care_types SET
  label = 'Lombalgie/Cervisalgie',
  description = 'Consultation pour lombalgies et cervicalgies chroniques'
WHERE code = 'DOULEUR';

UPDATE ref_care_types SET
  label = 'Échographie',
  description = 'Séance d''échographie ostéo-articulaire'
WHERE code = 'ECHO';

UPDATE ref_care_types SET
  label = 'Gestes Thérapeutiques',
  description = 'Infiltrations et autres gestes thérapeutiques'
WHERE code = 'GESTE';

UPDATE ref_care_types SET
  label = 'Séances de Réadaptation',
  description = 'Séances de kinésithérapie et réadaptation'
WHERE code = 'SEANCES';

UPDATE ref_care_types SET
  label = 'Densitométrie Osseuse',
  description = 'Mesure de densité osseuse (DXA/DEXA)'
WHERE code = 'DXA';

UPDATE ref_act_types SET label = 'Consultation RIC', description = 'Consultation Rhumatismes Inflammatoires Chroniques' WHERE code = 'CS_RIC';
UPDATE ref_act_types SET label = 'Consultation RD', description = 'Consultation Rhumatismes Dégénératifs' WHERE code = 'CS_RD';
UPDATE ref_act_types SET label = 'Consultation OS', description = 'Consultation Pathologie Osseuse' WHERE code = 'CS_OS';
UPDATE ref_act_types SET label = 'Consultation Douleur', description = 'Consultation Lombalgie/Cervisalgie' WHERE code = 'CS_DOULEUR';
UPDATE ref_act_types SET label = 'Échographie', description = 'Séance d''échographie' WHERE code = 'ECHO';
UPDATE ref_act_types SET label = 'Infiltration', description = 'Infiltration intra-articulaire' WHERE code = 'INFILT';
UPDATE ref_act_types SET label = 'Séance de réadaptation', description = 'Séance de kinésithérapie / réadaptation' WHERE code = 'SEANCE';
UPDATE ref_act_types SET label = 'Densitométrie', description = 'Mesure de densité osseuse' WHERE code = 'DXA';

UPDATE ref_form_types SET form_label = 'Consultation Rhumatismes Inflammatoires Chroniques' WHERE form_name = 'form_cs_ric';
UPDATE ref_form_types SET form_label = 'Consultation Rhumatismes Dégénératifs' WHERE form_name = 'form_cs_rd';
UPDATE ref_form_types SET form_label = 'Consultation Pathologie Osseuse' WHERE form_name = 'form_cs_os';
UPDATE ref_form_types SET form_label = 'Consultation Lombalgie / Cervisalgie' WHERE form_name = 'form_cs_douleur';
UPDATE ref_form_types SET form_label = 'Échographie Ostéo-Articulaire' WHERE form_name = 'form_cs_echo';
UPDATE ref_form_types SET form_label = 'Geste Thérapeutique (Infiltration)' WHERE form_name = 'form_cs_geste';
UPDATE ref_form_types SET form_label = 'Séance de Réadaptation' WHERE form_name = 'form_cs_seances';
UPDATE ref_form_types SET form_label = 'Densitométrie Osseuse (DXA)' WHERE form_name = 'form_cs_dxa';
