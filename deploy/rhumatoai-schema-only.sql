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
-- Current Database: `rhumatoai`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `rhumatoai` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `rhumatoai`;

--
-- Table structure for table `act_diagnoses`
--

DROP TABLE IF EXISTS `act_diagnoses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_diagnoses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `act_id` int NOT NULL,
  `diagnosis_label` varchar(255) NOT NULL,
  `diagnosis_notes` text,
  `diagnosis_type` varchar(20) DEFAULT 'principal',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `act_id` (`act_id`),
  KEY `ix_act_diagnoses_id` (`id`),
  CONSTRAINT `act_diagnoses_ibfk_1` FOREIGN KEY (`act_id`) REFERENCES `medical_acts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3845 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `act_documents`
--

DROP TABLE IF EXISTS `act_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `act_id` int NOT NULL,
  `filename` varchar(255) DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `act_id` (`act_id`),
  KEY `ix_act_documents_id` (`id`),
  CONSTRAINT `act_documents_ibfk_1` FOREIGN KEY (`act_id`) REFERENCES `medical_acts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9245 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `act_forms`
--

DROP TABLE IF EXISTS `act_forms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_forms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `act_id` int NOT NULL,
  `ref_form_type_id` int NOT NULL,
  `form_table_id` int NOT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_act_form` (`act_id`,`ref_form_type_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_form_type` (`ref_form_type_id`),
  CONSTRAINT `act_forms_ibfk_1` FOREIGN KEY (`act_id`) REFERENCES `medical_acts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `act_forms_ibfk_2` FOREIGN KEY (`ref_form_type_id`) REFERENCES `ref_form_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `act_forms_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `act_results`
--

DROP TABLE IF EXISTS `act_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `act_id` int NOT NULL,
  `patient_id` int NOT NULL,
  `result_date` date DEFAULT NULL,
  `result_name` varchar(255) DEFAULT NULL,
  `result_value` varchar(100) DEFAULT NULL,
  `result_unit` varchar(50) DEFAULT NULL,
  `is_abnormal` tinyint(1) DEFAULT '0',
  `result_category` varchar(50) DEFAULT NULL,
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `act_id` (`act_id`),
  KEY `patient_id` (`patient_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `act_results_ibfk_1` FOREIGN KEY (`act_id`) REFERENCES `medical_acts` (`id`),
  CONSTRAINT `act_results_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `act_results_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `act_treatments`
--

DROP TABLE IF EXISTS `act_treatments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_treatments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `act_id` int NOT NULL,
  `drug_name` varchar(255) DEFAULT NULL,
  `dosage` varchar(100) DEFAULT NULL,
  `frequency` varchar(100) DEFAULT NULL,
  `duration` varchar(100) DEFAULT NULL,
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `act_id` (`act_id`),
  CONSTRAINT `act_treatments_ibfk_1` FOREIGN KEY (`act_id`) REFERENCES `medical_acts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `alembic_version`
--

DROP TABLE IF EXISTS `alembic_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `appointments`
--

DROP TABLE IF EXISTS `appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int DEFAULT NULL,
  `reason` text,
  `status` varchar(20) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `datetime_scheduled` datetime DEFAULT NULL,
  `doctor_id` int DEFAULT NULL,
  `act_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `patient_id` (`patient_id`),
  KEY `ix_appointments_id` (`id`),
  KEY `fk_appointments_doctor` (`doctor_id`),
  KEY `fk_appointments_act` (`act_id`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `fk_appointments_act` FOREIGN KEY (`act_id`) REFERENCES `medical_acts` (`id`),
  CONSTRAINT `fk_appointments_doctor` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=82021 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `username` varchar(100) DEFAULT NULL,
  `action` varchar(100) DEFAULT NULL,
  `resource_type` varchar(50) DEFAULT NULL,
  `resource_id` varchar(50) DEFAULT NULL,
  `details` text,
  `ip_address` varchar(45) DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `timestamp` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `ix_audit_logs_action` (`action`),
  KEY `ix_audit_logs_id` (`id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=441 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chat_messages`
--

DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `patient_id` int DEFAULT NULL,
  `message` text,
  `response` text,
  `language` varchar(10) DEFAULT NULL,
  `model_name` varchar(100) DEFAULT NULL,
  `tokens_used` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `session_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_chat_messages_patient_id` (`patient_id`),
  KEY `ix_chat_messages_created_at` (`created_at`),
  KEY `ix_chat_messages_id` (`id`),
  KEY `ix_chat_messages_user_id` (`user_id`),
  KEY `ix_chat_messages_session_id` (`session_id`),
  CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chat_messages_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `fk_chat_messages_session_id` FOREIGN KEY (`session_id`) REFERENCES `chat_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=239 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chat_sessions`
--

DROP TABLE IF EXISTS `chat_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_chat_sessions_patient_id` (`patient_id`),
  KEY `ix_chat_sessions_created_by` (`created_by`),
  CONSTRAINT `chat_sessions_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_sessions_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dynamic_form_responses`
--

DROP TABLE IF EXISTS `dynamic_form_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dynamic_form_responses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `act_id` int NOT NULL,
  `template_id` int NOT NULL,
  `response_data` json NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_dynamic_form_responses_act_id` (`act_id`),
  KEY `ix_dynamic_form_responses_id` (`id`),
  KEY `ix_dynamic_form_responses_template_id` (`template_id`),
  CONSTRAINT `dynamic_form_responses_ibfk_1` FOREIGN KEY (`act_id`) REFERENCES `medical_acts` (`id`),
  CONSTRAINT `dynamic_form_responses_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `dynamic_form_templates` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dynamic_form_templates`
--

DROP TABLE IF EXISTS `dynamic_form_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dynamic_form_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `schema_json` json NOT NULL,
  `is_active` tinyint(1) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_dynamic_form_templates_title` (`title`),
  KEY `ix_dynamic_form_templates_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_cs_douleur`
--

DROP TABLE IF EXISTS `form_cs_douleur`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_cs_douleur` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pain_locations` json DEFAULT NULL,
  `pain_intensity_vas` int DEFAULT NULL,
  `pain_duration` varchar(255) DEFAULT NULL,
  `pain_character` json DEFAULT NULL,
  `onset_type` varchar(50) DEFAULT NULL,
  `initial_pain_date` date DEFAULT NULL,
  `previous_treatments_json` json DEFAULT NULL,
  `pain_progression` varchar(50) DEFAULT NULL,
  `aggravating_factors` json DEFAULT NULL,
  `relieving_factors` json DEFAULT NULL,
  `time_of_day_pattern` varchar(255) DEFAULT NULL,
  `functional_limitation_score` int DEFAULT NULL,
  `sleep_disturbance_present` tinyint DEFAULT NULL,
  `sleep_quality` varchar(50) DEFAULT NULL,
  `work_impact` text,
  `daily_activity_limitations` text,
  `analgesics_json` json DEFAULT NULL,
  `nsaids_json` json DEFAULT NULL,
  `other_medications_json` json DEFAULT NULL,
  `tender_points_locations` json DEFAULT NULL,
  `range_of_motion_findings` text,
  `neurological_exam_findings` text,
  `anxiety_level` int DEFAULT NULL,
  `depression_screening` varchar(50) DEFAULT NULL,
  `catastrophizing_score` int DEFAULT NULL,
  `coping_mechanisms` json DEFAULT NULL,
  `recommended_interventions` json DEFAULT NULL,
  `referrals_needed` json DEFAULT NULL,
  `follow_up_plan` text,
  `clinical_notes` text,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_cs_dxa`
--

DROP TABLE IF EXISTS `form_cs_dxa`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_cs_dxa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `scan_date` date NOT NULL,
  `machine_manufacturer` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `machine_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `software_version` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scan_quality` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `positioning_issues` text COLLATE utf8mb4_unicode_ci,
  `artifacts_present` tinyint DEFAULT '0',
  `artifacts_description` text COLLATE utf8mb4_unicode_ci,
  `spine_bmd` decimal(5,2) DEFAULT NULL,
  `spine_tscore` decimal(5,2) DEFAULT NULL,
  `spine_zscore` decimal(5,2) DEFAULT NULL,
  `spine_young_adult_percent` decimal(5,1) DEFAULT NULL,
  `spine_age_matched_percent` decimal(5,1) DEFAULT NULL,
  `spine_fracture_risk` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `femoral_neck_bmd` decimal(5,2) DEFAULT NULL,
  `femoral_neck_tscore` decimal(5,2) DEFAULT NULL,
  `femoral_neck_zscore` decimal(5,2) DEFAULT NULL,
  `femoral_neck_fracture_risk` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_hip_bmd` decimal(5,2) DEFAULT NULL,
  `total_hip_tscore` decimal(5,2) DEFAULT NULL,
  `total_hip_zscore` decimal(5,2) DEFAULT NULL,
  `total_hip_fracture_risk` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `forearm_scanned` tinyint DEFAULT '0',
  `forearm_one_third_bmd` decimal(5,2) DEFAULT NULL,
  `forearm_one_third_tscore` decimal(5,2) DEFAULT NULL,
  `total_body_measured` tinyint DEFAULT '0',
  `total_body_lean_mass` decimal(10,2) DEFAULT NULL,
  `total_body_fat_mass` decimal(10,2) DEFAULT NULL,
  `total_body_fat_percent` decimal(5,1) DEFAULT NULL,
  `vfa_performed` tinyint DEFAULT '0',
  `vfa_findings` text COLLATE utf8mb4_unicode_ci,
  `vertebral_deformities_present` tinyint DEFAULT '0',
  `vertebral_deformity_count` int DEFAULT NULL,
  `who_diagnosis_spine` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `who_diagnosis_hip` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `who_diagnosis_femoral_neck` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frax_major_fracture_probability` decimal(5,2) DEFAULT NULL,
  `frax_hip_fracture_probability` decimal(5,2) DEFAULT NULL,
  `previous_scan_date` date DEFAULT NULL,
  `previous_scan_spine_tscore` decimal(5,2) DEFAULT NULL,
  `previous_scan_hip_tscore` decimal(5,2) DEFAULT NULL,
  `bmd_change_spine` decimal(5,2) DEFAULT NULL,
  `bmd_change_hip` decimal(5,2) DEFAULT NULL,
  `annual_bmd_change_percent` decimal(5,2) DEFAULT NULL,
  `indication` text COLLATE utf8mb4_unicode_ci,
  `risk_factors` json DEFAULT NULL,
  `current_medications_relevant` json DEFAULT NULL,
  `impression` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `recommendations` text COLLATE utf8mb4_unicode_ci,
  `follow_up_interval` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scan_date` (`scan_date`),
  KEY `idx_spine_tscore` (`spine_tscore`),
  KEY `idx_hip_tscore` (`total_hip_tscore`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_cs_echo`
--

DROP TABLE IF EXISTS `form_cs_echo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_cs_echo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `echo_date` date NOT NULL,
  `anatomical_region` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `indication` text COLLATE utf8mb4_unicode_ci,
  `machine_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `probe_frequency` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `technique_used` text COLLATE utf8mb4_unicode_ci,
  `side_examined` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comparison_with_opposite_side` tinyint DEFAULT '0',
  `synovitis_present` tinyint DEFAULT '0',
  `synovitis_grade` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `synovitis_description` text COLLATE utf8mb4_unicode_ci,
  `effusion_present` tinyint DEFAULT '0',
  `effusion_volume` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `effusion_description` text COLLATE utf8mb4_unicode_ci,
  `tendinopathy_present` tinyint DEFAULT '0',
  `tendinopathy_sites` json DEFAULT NULL,
  `tendinopathy_description` text COLLATE utf8mb4_unicode_ci,
  `bursitis_present` tinyint DEFAULT '0',
  `bursitis_sites` json DEFAULT NULL,
  `bursitis_description` text COLLATE utf8mb4_unicode_ci,
  `bone_erosions_present` tinyint DEFAULT '0',
  `erosion_count` int DEFAULT NULL,
  `erosion_severity` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `erosion_locations` json DEFAULT NULL,
  `osteophytes_present` tinyint DEFAULT '0',
  `osteophyte_description` text COLLATE utf8mb4_unicode_ci,
  `cartilage_damage_present` tinyint DEFAULT '0',
  `cartilage_thinning` tinyint DEFAULT '0',
  `cartilage_description` text COLLATE utf8mb4_unicode_ci,
  `measurements_json` json DEFAULT NULL,
  `doppler_performed` tinyint DEFAULT '0',
  `doppler_hyperemia_present` tinyint DEFAULT '0',
  `doppler_grade` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `doppler_findings` text COLLATE utf8mb4_unicode_ci,
  `primary_pathology` text COLLATE utf8mb4_unicode_ci,
  `secondary_findings` json DEFAULT NULL,
  `impression` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `recommendations` text COLLATE utf8mb4_unicode_ci,
  `image_urls` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_echo_date` (`echo_date`),
  KEY `idx_region` (`anatomical_region`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_cs_geste`
--

DROP TABLE IF EXISTS `form_cs_geste`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_cs_geste` (
  `id` int NOT NULL AUTO_INCREMENT,
  `procedure_date` datetime NOT NULL,
  `procedure_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `anatomical_site` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `side` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clinical_indication` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `diagnostic_purpose` tinyint DEFAULT '0',
  `therapeutic_purpose` tinyint DEFAULT '0',
  `guidance_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `needle_size` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approach` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `technique_notes` text COLLATE utf8mb4_unicode_ci,
  `anesthesia_used` tinyint DEFAULT '0',
  `anesthesia_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `anesthesia_agent` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `anesthesia_dose` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_injected` json DEFAULT NULL,
  `fluid_aspirated_volume` decimal(10,2) DEFAULT NULL,
  `fluid_appearance` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cell_count` int DEFAULT NULL,
  `crystal_analysis` text COLLATE utf8mb4_unicode_ci,
  `culture_done` tinyint DEFAULT '0',
  `culture_organism` text COLLATE utf8mb4_unicode_ci,
  `biopsy_sample_obtained` tinyint DEFAULT '0',
  `biopsy_location_description` text COLLATE utf8mb4_unicode_ci,
  `histology_findings` text COLLATE utf8mb4_unicode_ci,
  `complications_present` tinyint DEFAULT '0',
  `complications_json` json DEFAULT NULL,
  `patient_tolerance` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pain_during_procedure` int DEFAULT NULL,
  `pain_post_procedure` int DEFAULT NULL,
  `swelling_post_procedure` tinyint DEFAULT '0',
  `bleeding_post_procedure` tinyint DEFAULT '0',
  `follow_up_recommended` tinyint DEFAULT '0',
  `follow_up_instructions` text COLLATE utf8mb4_unicode_ci,
  `clinical_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_procedure_date` (`procedure_date`),
  KEY `idx_site` (`anatomical_site`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_cs_os`
--

DROP TABLE IF EXISTS `form_cs_os`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_cs_os` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dxa_date` date DEFAULT NULL,
  `spine_tscore` decimal(5,2) DEFAULT NULL,
  `spine_zscore` decimal(5,2) DEFAULT NULL,
  `hip_tscore` decimal(5,2) DEFAULT NULL,
  `hip_zscore` decimal(5,2) DEFAULT NULL,
  `femoral_neck_tscore` decimal(5,2) DEFAULT NULL,
  `total_body_bmd` decimal(5,2) DEFAULT NULL,
  `fracture_history_present` tinyint DEFAULT '0',
  `fracture_sites` json DEFAULT NULL,
  `vertebral_fracture_present` tinyint DEFAULT '0',
  `vertebral_fracture_count` int DEFAULT NULL,
  `frax_major_osteoporotic` decimal(5,2) DEFAULT NULL,
  `frax_hip_fracture` decimal(5,2) DEFAULT NULL,
  `risk_factors` json DEFAULT NULL,
  `fall_risk` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fall_history_present` tinyint DEFAULT '0',
  `fall_count_past_year` int DEFAULT NULL,
  `p1np_value` decimal(10,2) DEFAULT NULL,
  `ctx_value` decimal(10,2) DEFAULT NULL,
  `p1np_date` date DEFAULT NULL,
  `ctx_date` date DEFAULT NULL,
  `calcium_level` decimal(10,2) DEFAULT NULL,
  `vitamin_d_level` decimal(10,2) DEFAULT NULL,
  `supplementation_json` json DEFAULT NULL,
  `bisphosphonates_json` json DEFAULT NULL,
  `hormone_therapy_json` json DEFAULT NULL,
  `other_medications_json` json DEFAULT NULL,
  `physical_activity` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `smoking_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alcohol_consumption` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `height_cm` decimal(5,2) DEFAULT NULL,
  `kyphosis_present` tinyint DEFAULT '0',
  `back_pain_present` tinyint DEFAULT '0',
  `back_pain_severity` int DEFAULT NULL,
  `clinical_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dxa_date` (`dxa_date`),
  KEY `idx_hip_tscore` (`hip_tscore`),
  KEY `idx_spine_tscore` (`spine_tscore`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_cs_rd`
--

DROP TABLE IF EXISTS `form_cs_rd`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_cs_rd` (
  `id` int NOT NULL AUTO_INCREMENT,
  `current_treatment_none` tinyint DEFAULT '0',
  `current_treatment_json` json DEFAULT NULL,
  `arthralgie_present` tinyint DEFAULT '0',
  `arthralgie_horaire` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `arthralgie_duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `arthralgie_locations` json DEFAULT NULL,
  `joint_swelling_present` tinyint DEFAULT '0',
  `joint_swelling_locations` json DEFAULT NULL,
  `rachialgie_present` tinyint DEFAULT '0',
  `rachialgie_horaire` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rachialgie_duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rachialgie_locations` json DEFAULT NULL,
  `fessialgie_present` tinyint DEFAULT '0',
  `fessialgie_horaire` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fessialgie_duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fessialgie_locations` json DEFAULT NULL,
  `enthesalgie_present` tinyint DEFAULT '0',
  `enthesalgie_locations` json DEFAULT NULL,
  `myalgie_present` tinyint DEFAULT '0',
  `myalgie_horaire` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `myalgie_duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `other_signs_text` text COLLATE utf8mb4_unicode_ci,
  `articular_index` int DEFAULT NULL,
  `synovial_index` int DEFAULT NULL,
  `clinical_examination_notes` text COLLATE utf8mb4_unicode_ci,
  `lab_inflammatory_json` json DEFAULT NULL,
  `lab_renal_json` json DEFAULT NULL,
  `lab_hepatic_json` json DEFAULT NULL,
  `lab_metabolic_json` json DEFAULT NULL,
  `lab_electrolytes_json` json DEFAULT NULL,
  `lab_immunology_json` json DEFAULT NULL,
  `lab_infection_json` json DEFAULT NULL,
  `imaging_xray` tinyint DEFAULT '0',
  `imaging_xray_findings` text COLLATE utf8mb4_unicode_ci,
  `imaging_ultrasound` tinyint DEFAULT '0',
  `imaging_ultrasound_findings` text COLLATE utf8mb4_unicode_ci,
  `imaging_ct` tinyint DEFAULT '0',
  `imaging_ct_findings` text COLLATE utf8mb4_unicode_ci,
  `imaging_mri` tinyint DEFAULT '0',
  `imaging_mri_findings` text COLLATE utf8mb4_unicode_ci,
  `imaging_other` tinyint DEFAULT '0',
  `imaging_other_findings` text COLLATE utf8mb4_unicode_ci,
  `diagnosis_osteoarthritis_json` json DEFAULT NULL,
  `diagnosis_spine_json` json DEFAULT NULL,
  `diagnosis_tendinopathy_json` json DEFAULT NULL,
  `diagnosis_other_text` text COLLATE utf8mb4_unicode_ci,
  `treatment_decision` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_starting_json` json DEFAULT NULL,
  `treatment_maintain_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_maintain_remarks` text COLLATE utf8mb4_unicode_ci,
  `treatment_stop_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_stop_remarks` text COLLATE utf8mb4_unicode_ci,
  `other_therapeutic_decisions` text COLLATE utf8mb4_unicode_ci,
  `prescription` text COLLATE utf8mb4_unicode_ci,
  `additional_notes` text COLLATE utf8mb4_unicode_ci,
  `form_date` date DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_form_date` (`form_date`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `form_cs_rd_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_cs_ric`
--

DROP TABLE IF EXISTS `form_cs_ric`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_cs_ric` (
  `id` int NOT NULL AUTO_INCREMENT,
  `crp_value` decimal(10,2) DEFAULT NULL,
  `crp_date` date DEFAULT NULL,
  `esr_value` decimal(10,2) DEFAULT NULL,
  `esr_date` date DEFAULT NULL,
  `das28_score` decimal(5,2) DEFAULT NULL,
  `tender_joint_count` int DEFAULT NULL,
  `swollen_joint_count` int DEFAULT NULL,
  `morning_stiffness_duration` int DEFAULT NULL,
  `affected_joints` json DEFAULT NULL,
  `joint_deformity_present` tinyint DEFAULT '0',
  `joint_deformity_description` text COLLATE utf8mb4_unicode_ci,
  `fever_present` tinyint DEFAULT '0',
  `fatigue_level` int DEFAULT NULL,
  `weight_loss_present` tinyint DEFAULT '0',
  `weight_loss_amount` decimal(10,2) DEFAULT NULL,
  `dmards_json` json DEFAULT NULL,
  `biologics_json` json DEFAULT NULL,
  `nsaids_json` json DEFAULT NULL,
  `corticosteroids_json` json DEFAULT NULL,
  `rheumatoid_factor` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `anti_ccp` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ana_present` tinyint DEFAULT '0',
  `treatment_adherence` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `adverse_effects` text COLLATE utf8mb4_unicode_ci,
  `treatment_response` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clinical_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_das28` (`das28_score`),
  KEY `idx_crp_date` (`crp_date`),
  KEY `idx_esr_date` (`esr_date`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_cs_seances`
--

DROP TABLE IF EXISTS `form_cs_seances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_cs_seances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_date` date NOT NULL,
  `session_start_time` time DEFAULT NULL,
  `session_duration` int DEFAULT NULL,
  `therapist_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `modality_description` text COLLATE utf8mb4_unicode_ci,
  `anatomical_regions` json DEFAULT NULL,
  `side_treated` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frequency_hz` decimal(10,2) DEFAULT NULL,
  `intensity_level` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pulse_width_microseconds` int DEFAULT NULL,
  `temperature_celsius` decimal(5,1) DEFAULT NULL,
  `duration_per_area` int DEFAULT NULL,
  `pain_before_session` int DEFAULT NULL,
  `pain_after_session` int DEFAULT NULL,
  `pain_relief_achieved` tinyint DEFAULT '0',
  `functional_improvement` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `patient_comfort_level` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `adverse_reactions` tinyint DEFAULT '0',
  `adverse_reactions_description` text COLLATE utf8mb4_unicode_ci,
  `swelling_before` int DEFAULT NULL,
  `swelling_after` int DEFAULT NULL,
  `range_of_motion_before` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `range_of_motion_after` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `muscle_strength_before` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `muscle_strength_after` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `patient_compliance` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recommendations_given` text COLLATE utf8mb4_unicode_ci,
  `home_exercises_prescribed` tinyint DEFAULT '0',
  `session_number_in_series` int DEFAULT NULL,
  `total_sessions_planned` int DEFAULT NULL,
  `next_session_date` date DEFAULT NULL,
  `progress_notes` text COLLATE utf8mb4_unicode_ci,
  `clinical_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_session_date` (`session_date`),
  KEY `idx_therapist` (`therapist_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `medical_act_staff`
--

DROP TABLE IF EXISTS `medical_act_staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `medical_act_staff` (
  `id` int NOT NULL AUTO_INCREMENT,
  `medical_act_id` int NOT NULL,
  `staff_id` int NOT NULL,
  `role` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `medical_act_id` (`medical_act_id`),
  KEY `staff_id` (`staff_id`),
  KEY `ix_medical_act_staff_id` (`id`),
  CONSTRAINT `medical_act_staff_ibfk_1` FOREIGN KEY (`medical_act_id`) REFERENCES `medical_acts` (`id`),
  CONSTRAINT `medical_act_staff_ibfk_2` FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `medical_acts`
--

DROP TABLE IF EXISTS `medical_acts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `medical_acts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int DEFAULT NULL,
  `act_type` varchar(50) DEFAULT NULL,
  `description` text,
  `report` text,
  `notes` text,
  `status` varchar(20) DEFAULT NULL,
  `doctor_id` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `act_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `patient_id` (`patient_id`),
  KEY `ix_medical_acts_id` (`id`),
  KEY `fk_medical_acts_doctor` (`doctor_id`),
  CONSTRAINT `fk_medical_acts_doctor` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`),
  CONSTRAINT `medical_acts_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=83953 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `message` text,
  `read` tinyint(1) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `sender_id` int DEFAULT NULL,
  `is_public` tinyint(1) DEFAULT '0',
  `category` varchar(50) DEFAULT 'message',
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `ix_notifications_id` (`id`),
  KEY `fk_sender` (`sender_id`),
  CONSTRAINT `fk_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `patient_allergies`
--

DROP TABLE IF EXISTS `patient_allergies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patient_allergies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `allergen` varchar(255) DEFAULT NULL,
  `reaction_type` varchar(100) DEFAULT NULL,
  `severity` varchar(20) DEFAULT NULL,
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `patient_id` (`patient_id`),
  CONSTRAINT `patient_allergies_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `patients`
--

DROP TABLE IF EXISTS `patients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ipp` varchar(50) DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` text,
  `city` varchar(100) DEFAULT NULL,
  `insurance` varchar(100) DEFAULT NULL,
  `insurance_number` varchar(50) DEFAULT NULL,
  `blood_type` varchar(10) DEFAULT NULL,
  `primary_diagnosis` varchar(255) DEFAULT NULL,
  `notes` text,
  `notes_admin` text,
  `status` varchar(20) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `emergency_contact_name` varchar(255) DEFAULT NULL,
  `emergency_contact_relation` varchar(100) DEFAULT NULL,
  `emergency_contact_phone` varchar(30) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `first_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `civility` varchar(10) DEFAULT NULL,
  `marital_status` varchar(50) DEFAULT NULL,
  `nationality` varchar(100) DEFAULT NULL,
  `profession` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_patients_ipp` (`ipp`),
  KEY `ix_patients_city` (`city`),
  KEY `ix_patients_phone` (`phone`),
  KEY `ix_patients_id` (`id`),
  KEY `idx_first_name` (`first_name`),
  KEY `idx_last_name` (`last_name`),
  FULLTEXT KEY `idx_fulltext_name` (`first_name`,`last_name`)
) ENGINE=InnoDB AUTO_INCREMENT=18877 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rag_chunks`
--

DROP TABLE IF EXISTS `rag_chunks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rag_chunks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int DEFAULT NULL,
  `source_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_id` int NOT NULL,
  `chunk_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `chunk_index` int NOT NULL DEFAULT '0',
  `qdrant_point_id` int DEFAULT NULL,
  `language` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en',
  `metadata` json DEFAULT NULL,
  `embedding_model` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'sentence-transformers/all-MiniLM-L6-v2',
  `is_embedded` tinyint(1) NOT NULL DEFAULT '0',
  `embedding_created_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `chunk_metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `qdrant_point_id` (`qdrant_point_id`),
  KEY `ix_rag_chunks_patient_id` (`patient_id`),
  KEY `ix_rag_chunks_source_type` (`source_type`),
  KEY `ix_rag_chunks_created_at` (`created_at`),
  KEY `ix_rag_chunks_source_lookup` (`source_type`,`source_id`),
  KEY `ix_rag_chunks_is_embedded` (`is_embedded`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rag_query_cache`
--

DROP TABLE IF EXISTS `rag_query_cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rag_query_cache` (
  `id` int NOT NULL AUTO_INCREMENT,
  `query_hash` varchar(64) NOT NULL,
  `patient_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `retrieval_payload` json NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `hit_count` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `query_hash` (`query_hash`),
  KEY `ix_rag_query_cache_hash` (`query_hash`),
  KEY `ix_rag_query_cache_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ref_act_types`
--

DROP TABLE IF EXISTS `ref_act_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ref_act_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ref_care_type_id` int NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint DEFAULT '1',
  `display_order` int DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`),
  KEY `idx_care_type` (`ref_care_type_id`),
  KEY `idx_active` (`is_active`),
  CONSTRAINT `ref_act_types_ibfk_1` FOREIGN KEY (`ref_care_type_id`) REFERENCES `ref_care_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ref_care_types`
--

DROP TABLE IF EXISTS `ref_care_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ref_care_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint DEFAULT '1',
  `display_order` int DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ref_form_types`
--

DROP TABLE IF EXISTS `ref_form_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ref_form_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ref_act_type_id` int NOT NULL,
  `form_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `form_label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `form_order` int DEFAULT '1',
  `is_active` tinyint DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_act_form` (`ref_act_type_id`,`form_name`),
  KEY `idx_form_name` (`form_name`),
  KEY `idx_act_type` (`ref_act_type_id`),
  KEY `idx_active` (`is_active`),
  CONSTRAINT `ref_form_types_ibfk_1` FOREIGN KEY (`ref_act_type_id`) REFERENCES `ref_act_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `hashed_password` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT NULL,
  `role` varchar(50) DEFAULT NULL,
  `is_admin` tinyint(1) DEFAULT NULL,
  `first_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `specialty` varchar(100) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `profile_picture` varchar(255) DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_users_email` (`email`),
  UNIQUE KEY `ix_users_username` (`username`),
  KEY `ix_users_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'rhumatoai'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-27 11:13:52
