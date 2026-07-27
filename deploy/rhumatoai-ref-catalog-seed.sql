-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: rhumatoai
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Dumping data for table `ref_care_types`
--

LOCK TABLES `ref_care_types` WRITE;
/*!40000 ALTER TABLE `ref_care_types` DISABLE KEYS */;
INSERT INTO `ref_care_types` VALUES (1,'RIC','Rhumatismes Inflammatoires Chroniques','Consultation pour rhumatismes inflammatoires chroniques',1,1,'2026-04-16 16:27:18'),(2,'RD','Rhumatismes Dégénératifs','Consultation pour rhumatismes dégénératifs (arthroses)',1,2,'2026-04-16 16:27:18'),(3,'OS','Pathologie Osseuse','Consultation pour pathologies osseuses (ostéoporose, etc)',1,3,'2026-04-16 16:27:18'),(4,'DOULEUR','Lombalgie/Cervisalgie','Consultation pour lombalgies et cervicalgies chroniques',1,4,'2026-04-16 16:27:18'),(5,'ECHO','Échographie','Séance d\'échographie ostéo-articulaire',1,5,'2026-04-16 16:27:18'),(6,'GESTE','Gestes Thérapeutiques','Infiltrations et autres gestes thérapeutiques',1,6,'2026-04-16 16:27:18'),(7,'SEANCES','Séances de Réadaptation','Séances de kinésithérapie et réadaptation',1,7,'2026-04-16 16:27:18'),(8,'DXA','Densitométrie Osseuse','Mesure de densité osseuse (DXA/DEXA)',1,8,'2026-04-16 16:27:18'),(19,'dynamic_templates','Formulaires personnalisés','Templates créés par les administrateurs',0,1,'2026-05-18 12:06:01'),(20,'exam','Examen & Diagnostic','Consultation, bilan bucco-dentaire et odontogramme',0,1,'2026-05-29 14:58:45'),(21,'soin','Soins Conservateurs','Traitement des caries et restaurations',0,2,'2026-05-29 14:58:45'),(22,'endo','Endodontie','Traitement de canal (dévitalisation)',0,3,'2026-05-29 14:58:45'),(23,'extraction','Extraction & Chirurgie','Avulsions dentaires et petite chirurgie',0,4,'2026-05-29 14:58:45'),(24,'prothese','Prothèse','Prothèses fixées et amovibles',0,5,'2026-05-29 14:58:45'),(25,'paro','Parodontologie','Détartrage, surfaçage et suivi parodontal',0,6,'2026-05-29 14:58:45'),(26,'plan','Plan de Traitement','Plan de traitement et devis',0,7,'2026-05-29 14:58:45');
/*!40000 ALTER TABLE `ref_care_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `ref_act_types`
--

LOCK TABLES `ref_act_types` WRITE;
/*!40000 ALTER TABLE `ref_act_types` DISABLE KEYS */;
INSERT INTO `ref_act_types` VALUES (1,2,'CS_RD','Consultation RD','Consultation Rhumatismes Dégénératifs',1,1,'2026-04-16 16:27:18'),(2,1,'CS_RIC','Consultation RIC','Consultation Rhumatismes Inflammatoires Chroniques',1,1,'2026-04-17 07:41:46'),(4,3,'CS_OS','Consultation OS','Consultation Pathologie Osseuse',1,1,'2026-04-17 07:42:17'),(5,4,'CS_DOULEUR','Consultation Douleur','Consultation Lombalgie/Cervisalgie',1,1,'2026-04-17 07:42:24'),(6,5,'ECHO','Échographie','Séance d\'échographie',1,1,'2026-04-17 07:42:30'),(7,6,'INFILT','Infiltration','Infiltration intra-articulaire',1,1,'2026-04-17 07:42:35'),(8,7,'SEANCE_KIN','Séance Kinésithérapie','Séance de kinésithérapie',1,1,'2026-04-17 07:42:41'),(9,8,'DXA_MEASURE','Mesure DXA','Mesure de densité osseuse',1,1,'2026-04-17 07:42:47'),(26,19,'dynamic_template_act','Formulaires personnalisés','Act types for dynamic templates',0,1,'2026-05-18 12:06:01'),(27,20,'exam_bilan','Examen bucco-dentaire',NULL,1,1,'2026-05-29 14:58:45'),(28,21,'soin_carie','Soin / Carie',NULL,1,1,'2026-05-29 14:58:45'),(29,22,'endo_canal','Traitement endodontique',NULL,1,1,'2026-05-29 14:58:45'),(30,23,'extraction_avulsion','Extraction',NULL,1,1,'2026-05-29 14:58:45'),(31,24,'prothese_pose','Prothèse',NULL,0,1,'2026-05-29 14:58:45'),(32,25,'paro_traitement','Traitement parodontal',NULL,1,1,'2026-05-29 14:58:45'),(33,26,'plan_devis','Plan & Devis',NULL,1,1,'2026-05-29 14:58:45');
/*!40000 ALTER TABLE `ref_act_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `ref_form_types`
--

LOCK TABLES `ref_form_types` WRITE;
/*!40000 ALTER TABLE `ref_form_types` DISABLE KEYS */;
INSERT INTO `ref_form_types` VALUES (1,1,'form_cs_rd','Consultation Rhumatisme Dégénératif',1,1,'2026-04-16 16:27:20'),(6,2,'form_cs_ric','Consultation Rhumatismes Inflammatoires Chroniques',1,1,'2026-04-22 10:49:02'),(7,4,'form_cs_os','Consultation Pathologie Osseuse',1,1,'2026-04-22 10:49:02'),(8,6,'form_cs_echo','Séance d\'Échographie',1,1,'2026-04-22 10:49:02'),(9,7,'form_cs_geste','Infiltration Intra-Articulaire',1,1,'2026-04-22 10:49:02'),(10,8,'form_cs_seances','Séance de Kinésithérapie',1,1,'2026-04-22 10:49:02'),(11,9,'form_cs_dxa','Densitométrie Osseuse DXA',1,1,'2026-04-22 10:49:02'),(26,5,'form_cs_douleur','Consultation Unité de la Douleur',1,1,'2026-04-22 11:39:57'),(27,26,'dynamic_template_3','FORM 3',1,0,'2026-05-18 12:06:01'),(28,26,'dynamic_template_1','Form test',1,0,'2026-05-18 12:10:29'),(29,26,'dynamic_template_2','FORM Test 2',1,0,'2026-05-18 16:04:47'),(30,27,'form_dent_exam','Examen bucco-dentaire & odontogramme',1,0,'2026-05-29 14:58:45'),(31,28,'form_dent_soin','Soin conservateur (carie)',1,0,'2026-05-29 14:58:45'),(32,29,'form_dent_endo','Endodontie (traitement de canal)',1,0,'2026-05-29 14:58:45'),(33,30,'form_dent_extraction','Extraction / Chirurgie',1,0,'2026-05-29 14:58:45'),(34,31,'form_dent_prothese','Prothèse (couronne, bridge, PA)',1,0,'2026-05-29 14:58:45'),(35,32,'form_dent_paro','Parodontologie (détartrage, charting)',1,0,'2026-05-29 14:58:45'),(36,33,'form_dent_plan','Plan de traitement / Devis',1,0,'2026-05-29 14:58:45');
/*!40000 ALTER TABLE `ref_form_types` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-27 11:14:22
