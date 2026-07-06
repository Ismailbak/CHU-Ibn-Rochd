import React, { useState, useEffect, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import {
  FiUser, FiCalendar, FiActivity, FiCheck, FiX,
  FiChevronRight, FiChevronLeft, FiSearch, FiAlertCircle, FiPlus,
  FiImage, FiZap, FiTarget, FiDollarSign, FiClock, FiEdit3, FiCheckCircle
} from 'react-icons/fi';
import { useToast } from '../../components/common';
import {
  getPatients, getPatient, createMedicalAct, updateMedicalAct, getDoctors, createActResult,
  getCareTypes, getActTypes, getFormTypes, linkFormToAct,
  createFormCsRd, updateFormCsRd,
  createFormCsRic, updateFormCsRic,
  createFormCsOs, updateFormCsOs,
  createFormCsEcho, updateFormCsEcho,
  createFormCsGeste, updateFormCsGeste,
  createFormCsSeances, updateFormCsSeances,
  createFormCsDxa, updateFormCsDxa,
  createFormCsDouleur, updateFormCsDouleur,
  getDynamicTemplates, submitDynamicResponse
} from '../../api/api';
import {
  FormCsRd, FormCsRic, FormCsOs, FormCsEcho, FormCsGeste, FormCsSeances, FormCsDxa, FormCsDouleur,
  CLINICAL_FORM_AUTOSAVE_EVENT
} from '../../components/MedicalForms/AllForms';
import DynamicFormRenderer from './DynamicFormRenderer';
import TreatmentPrescriptionPanel from '../../components/Treatments/TreatmentPrescriptionPanel';
import './MedicalActForm.css';

const CATEGORY_OPTIONS = [
  { value: 'rheumatology', label: 'Rhumatologie' },
  { value: 'imaging', label: 'Imagerie' },
  { value: 'intervention', label: 'Intervention' },
  { value: 'laboratory', label: 'Laboratoire' },
];

const ACT_TYPES = [
  { value: 'Consultation', label: 'Consultation', icon: <FiUser /> },
  { value: 'Examen', label: 'Examen', icon: <FiActivity /> },
  { value: 'Infiltration', label: 'Infiltration', icon: <FiZap /> },
  { value: 'Échographie', label: 'Échographie', icon: <FiImage /> },
  { value: 'Soin', label: 'Soin', icon: <FiTarget /> },
];

const STEPS = [
  { id: 1, label: 'Patient', icon: FiUser },
  { id: 2, label: 'Form', icon: FiActivity },
  { id: 3, label: 'Données', icon: FiTarget },
  { id: 4, label: 'Clinique', icon: FiActivity },
  { id: 5, label: 'Labo', icon: FiTarget },
  { id: 6, label: 'Facturation', icon: FiDollarSign },
];

// Form component mapping
const FORM_COMPONENT_MAP = {
  'form_cs_rd': FormCsRd,
  'form_cs_ric': FormCsRic,
  'form_cs_os': FormCsOs,
  'form_cs_echo': FormCsEcho,
  'form_cs_geste': FormCsGeste,
  'form_cs_seances': FormCsSeances,
  'form_cs_dxa': FormCsDxa,
  'form_cs_douleur': FormCsDouleur,
};

// API endpoint mapping
const FORM_API_MAP = {
  'form_cs_rd': 'cs_rd',
  'form_cs_ric': 'cs-ric',
  'form_cs_os': 'cs-os',
  'form_cs_echo': 'cs-echo',
  'form_cs_geste': 'cs-geste',
  'form_cs_seances': 'cs-seances',
  'form_cs_dxa': 'cs-dxa',
  'form_cs_douleur': 'cs-douleur',
};

// CRUD function mapping
const FORM_CRUD_MAP = {
  'form_cs_rd': { create: createFormCsRd, update: updateFormCsRd },
  'form_cs_ric': { create: createFormCsRic, update: updateFormCsRic },
  'form_cs_os': { create: createFormCsOs, update: updateFormCsOs },
  'form_cs_echo': { create: createFormCsEcho, update: updateFormCsEcho },
  'form_cs_geste': { create: createFormCsGeste, update: updateFormCsGeste },
  'form_cs_seances': { create: createFormCsSeances, update: updateFormCsSeances },
  'form_cs_dxa': { create: createFormCsDxa, update: updateFormCsDxa },
  'form_cs_douleur': { create: createFormCsDouleur, update: updateFormCsDouleur },
};

const EMPTY_FORM = {
  patientId: '',
  patientName: '',
  doctorId: '',
  date: new Date().toISOString().split('T')[0],
  careTypeId: '',
  formTypeId: '',
  formName: '',  // Name of the form (e.g., 'form_cs_ric')
  formId: '',     // ID of the form data record
  formCsRdId: '', // Legacy support
  actType: 'Consultation',
  category: 'rheumatology',
  diagnosis: '',
  report: '',
  amount: '',
  status: 'pending',
  treatment: [],
  notes: '',
  labResults: [],
};

/**
 * Wrapper component to handle nested form submission
 * Prevents clinical form submission from bubbling to parent medical act form
 */
function ClinicalFormWrapper({ formName, formTypes, formId, form, setForm, FORM_COMPONENT_MAP, FORM_CRUD_MAP, toast }) {
  const handleNestedFormSubmit = (e) => {
    // The nested form already has its own onSubmit handler, so we just stop propagation
    // to prevent the submit event from bubbling to the parent form
    e.stopPropagation();
  };

  return (
    <fieldset style={{ marginTop: '1rem', border: 'none', padding: 0 }} onSubmit={handleNestedFormSubmit}>
      <div className="info-box maf-clinical-sticky-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiCheckCircle style={{ color: '#10b981' }} />
          <span>Formulaire: <strong>{(formTypes.find(ft => ft.form_name === formName)?.form_label || formName).replace('Unit??', 'Unité')}</strong></span>
        </div>
        {formId && (
          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FiCheck /> Enregistré
          </span>
        )}
      </div>
      
      {React.createElement(FORM_COMPONENT_MAP[formName], {
        onSubmit: async (formData) => {
          try {
            const crud = FORM_CRUD_MAP[formName];
            if (!crud) throw new Error('Configuration API introuvable pour ce formulaire');
            
            let response;
            
            if (formId) {
              // Update existing form
              response = await crud.update(formId, formData);
            } else {
              // Create new form
              response = await crud.create(formData);
            }
            
            const result = response.data;
            if (result && result.id && !formId) {
              setForm(prev => ({ ...prev, formId: result.id }));
              console.log('Form created successfully with ID:', result.id);
            } else {
              console.log('Form updated successfully');
            }
            
            // Success feedback
            toast.success('✓ Enregistré');
            return result;
          } catch (err) {
            console.error('Error saving form:', err);
            let errorMsg = 'Erreur lors de l\'enregistrement du formulaire.';
            
            if (err.response?.data?.detail) {
              const detail = err.response.data.detail;
              if (Array.isArray(detail)) {
                errorMsg = detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join('\n');
              } else {
                errorMsg = detail;
              }
            }
            toast.error(errorMsg);
            throw err;
          }
        },
        initialData: {},
      })}
    </fieldset>
  );
}

function MedicalActForm({ onSuccess, onClose, initialData, isEdit }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState(1);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [userIntentToSubmit, setUserIntentToSubmit] = useState(false);
  const [isAutoSavingForm, setIsAutoSavingForm] = useState(false);
  
  // Treatment Form State
  
  const [careTypes, setCareTypes] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [formTypes, setFormTypes] = useState([]);
  const [dynamicTemplates, setDynamicTemplates] = useState([]);
  const [selectedDynamicTemplate, setSelectedDynamicTemplate] = useState(null);
  const [dynamicFormData, setDynamicFormData] = useState({});
  const [dynamicSaved, setDynamicSaved] = useState(false);
  const [isLoadingFormSystem, setIsLoadingFormSystem] = useState(false);

  // Initialize or update form when initialData changes
  useEffect(() => {
    if (initialData && isEdit) {
      // Safely extract diagnosis from multiple sources
      let diagnosisValue = '';
      if (initialData.diagnoses && Array.isArray(initialData.diagnoses) && initialData.diagnoses.length > 0) {
        diagnosisValue = initialData.diagnoses
          .map(d => d.diagnosis_label || d.label || '')
          .filter(d => d)
          .join(', ');
      } else if (initialData.diagnosis) {
        diagnosisValue = String(initialData.diagnosis).trim();
      }

      // Safely extract treatment from multiple sources
      let treatmentValue = [];
      if (initialData.treatments && Array.isArray(initialData.treatments) && initialData.treatments.length > 0) {
        treatmentValue = initialData.treatments.map(t => ({
          drug_name: t.drug_name || t.name || '',
          duration: t.duration || '',
          dosage: t.dosage || '',
          frequency: t.frequency || '',
          notes: t.notes || ''
        })).filter(t => t.drug_name);
      } else if (initialData.treatment) {
        // legacy string parsing
        treatmentValue = String(initialData.treatment).split(',').map(s => ({ drug_name: s.trim() })).filter(s => s.drug_name);
      }

      // Determine actType from various possible field names
      const actType = initialData.act_type 
        || initialData.actType 
        || initialData.type
        || 'Consultation';

      const firstForm = initialData.forms && Array.isArray(initialData.forms) && initialData.forms.length > 0 
        ? initialData.forms[0] 
        : null;

      setForm({
        id: initialData.id,
        patientId: initialData.patient_id || initialData.patientId,
        patientName: initialData.patient_name || initialData.patientName,
        doctorId: initialData.doctor_id || initialData.doctorId || '',
        date: initialData.act_date || initialData.date,
        actType: actType,
        category: initialData.category || 'rheumatology',
        diagnosis: diagnosisValue,
        report: initialData.report || '',
        amount: initialData.amount || '',
        status: initialData.status || 'pending',
        treatment: treatmentValue,
        notes: initialData.notes || '',
        formId: firstForm ? firstForm.form_table_id : '',
        formName: firstForm ? firstForm.form_name : '',
        labResults: [],
      });
      
      // When editing, skip to step 4 (Clinical Details) instead of starting from step 1
      setStep(4);
      setErrors({});
      setSubmitted(false);
      setSearchQuery('');
      setSelectedFamily('');
      setSelectedDrug('');
      setTreatmentDetails({ duration: '', dosage: '', frequency: '' });
    } else {
      setForm(EMPTY_FORM);
      setStep(1);
      setErrors({});
      setSubmitted(false);
      setSearchQuery('');
      setSelectedFamily('');
      setSelectedDrug('');
      setTreatmentDetails({ duration: '', dosage: '', frequency: '' });
    }
  }, [initialData, isEdit]);

  useEffect(() => {
    if (step !== 1) return undefined;
    const timer = setTimeout(() => {
      loadPatients(searchQuery);
    }, searchQuery.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [step, searchQuery]);

  useEffect(() => {
    loadDoctors();
    loadCareTypes();
    const onStorage = async (e) => {
      if (e.key === 'dynamic_templates_updated') {
        try {
          const payload = JSON.parse(e.newValue);
          // reload templates
          const res = await getDynamicTemplates();
          const templates = res.data || [];
          setDynamicTemplates(templates);

          if (payload && payload.id) {
            const template = templates.find(t => t.id === payload.id);
            if (template) {
              // auto-select the new template and move to step 2 so admin sees it
              setForm(prev => ({ ...prev, careTypeId: `dynamic_${template.id}` }));
              setSelectedDynamicTemplate(template);
              setDynamicFormData({});
              setDynamicSaved(false);
              setStep(2);
            }
          }
        } catch (err) {
          // fallback: reload care types
          loadCareTypes();
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    // reset saved flag when template or data changes
    setDynamicSaved(false);
  }, [selectedDynamicTemplate]);

  const loadPatients = async (query = '') => {
    setIsLoadingPatients(true);
    try {
      const params = { limit: 50 };
      const q = query.trim();
      if (q) params.q = q;
      const res = await getPatients(params);
      let list = res.data || [];
      if (form.patientId && !list.some((p) => p.id === form.patientId)) {
        try {
          const selected = await getPatient(form.patientId);
          if (selected.data) list = [selected.data, ...list];
        } catch {
          // Ignore missing selected patient; validation will catch empty selections.
        }
      }
      setPatients(list);
    } catch (err) {
      console.error("Error loading patients:", err);
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const loadDoctors = async () => {
    try {
      const res = await getDoctors();
      setDoctors(res.data || []);
    } catch (err) {
      console.error("Error loading doctors:", err);
    }
  };

  const loadCareTypes = async () => {
    try {
      const res = await getCareTypes();
      setCareTypes(res.data || []);
      
      const dynRes = await getDynamicTemplates();
      setDynamicTemplates(dynRes.data || []);
    } catch (err) {
      console.error("Error loading care types or dynamic templates:", err);
    }
  };

  const loadActTypes = async (careTypeId) => {
    try {
      const res = await getActTypes(careTypeId);
      setActTypes(res.data || []);
      return res.data || [];
    } catch (err) {
      console.error("Error loading act types:", err);
      setActTypes([]);
      return [];
    }
  };

  const loadFormTypes = async (actTypeId) => {
    try {
      const res = await getFormTypes(actTypeId);
      const formTypesData = res.data || [];
      setFormTypes(formTypesData);
      
      // Auto-select first form type if available
      if (formTypesData && formTypesData.length > 0) {
        const selectedFormType = formTypesData[0];
        if (selectedFormType && selectedFormType.form_name) {
          console.log('Auto-selecting form from loadFormTypes:', selectedFormType.form_name);
          setForm(prev => ({
            ...prev,
            formName: selectedFormType.form_name,
            formTypeId: selectedFormType.id,
          }));
        }
      }
      
      return formTypesData;
    } catch (err) {
      console.error("Error loading form types:", err);
      setFormTypes([]);
      return [];
    }
  };

  const handleCareTypeSelect = async (careTypeId) => {
    console.log('Care type selected:', careTypeId);
    setForm(prev => ({ ...prev, careTypeId, formTypeId: '', formName: '', formId: '' }));
    
    // Check if it's a dynamic template
    if (String(careTypeId).startsWith('dynamic_')) {
      const templateId = parseInt(String(careTypeId).replace('dynamic_', ''), 10);
      const template = dynamicTemplates.find(t => t.id === templateId);
      setSelectedDynamicTemplate(template);
      setActTypes([]);
      setFormTypes([]);
      return;
    } else {
      setSelectedDynamicTemplate(null);
    }
    
    if (careTypeId) {
      try {
        const actTypesData = await loadActTypes(careTypeId);
        console.log('Act types loaded:', actTypesData);
        // Auto-select first act type if available
        if (actTypesData && actTypesData.length > 0) {
          console.log('Loading form types for act type:', actTypesData[0].id);
          // loadFormTypes will auto-select the first form
          await loadFormTypes(actTypesData[0].id);
        }
      } catch (err) {
        console.error('Error in handleCareTypeSelect:', err);
      }
    }
  };

  const handleActTypeSelect = async (actTypeId) => {
    if (actTypeId) {
      await loadFormTypes(actTypeId);
    } else {
      setFormTypes([]);
      setForm(prev => ({ ...prev, formTypeId: '', formCsRdId: '' }));
    }
  };

  const filteredPatients = patients;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    // Clear error for this specific field when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const selectPatient = (patient) => {
    setForm(prev => ({
      ...prev,
      patientId: patient.id,
      patientName: `${patient.first_name} ${patient.last_name}`
    }));
    if (errors.patientId) setErrors(prev => ({ ...prev, patientId: '' }));
  };

  const validateStep = (s) => {
    const newErrors = {};
    if (s === 1) {
      if (!form.patientId) newErrors.patientId = 'Veuillez sélectionner un patient';
      if (!form.date) newErrors.date = 'La date est requise';
    }
    if (s === 2) {
      // Care type step - at least one must be selected
      if (!form.careTypeId) newErrors.careTypeId = 'Veuillez sélectionner un type de soin';
    }
    if (s === 3) {
      // Form type step - optional (user can skip)
    }
    if (s === 4) {
      // Clinical details - diagnosis still required
      const diagnosisValue = form.diagnosis ? String(form.diagnosis).trim() : '';
      if (!diagnosisValue) {
        newErrors.diagnosis = 'Le diagnostic est requis';
      }
      if (!form.doctorId) {
        newErrors.doctorId = 'Veuillez sélectionner un médecin';
      }
    }
    if (s === 5) {
      // Lab results step is optional
    }
    if (s === 6) {
      // Billing - require amount only when actually submitting
      const amountValue = String(form.amount || '').trim();
      if (!amountValue) {
        newErrors.amount = 'Le montant est requis';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const autoSaveClinicalForm = async () => {
    const savePromises = [];
    window.dispatchEvent(new CustomEvent(CLINICAL_FORM_AUTOSAVE_EVENT, {
      detail: {
        register: (promise) => savePromises.push(Promise.resolve(promise))
      }
    }));

    if (savePromises.length > 0) {
      await Promise.all(savePromises);
    }
  };

  const handleNext = async () => {
    if (validateStep(step)) {
      if (step === 3 && form.careTypeId && form.formName && FORM_COMPONENT_MAP[form.formName]) {
        setIsAutoSavingForm(true);
        try {
          await autoSaveClinicalForm();
        } catch {
          setIsAutoSavingForm(false);
          return;
        }
        setIsAutoSavingForm(false);
      }
      if (step === 3 && selectedDynamicTemplate) {
        setDynamicSaved(true);
      }
      setStep(s => s + 1);
      setUserIntentToSubmit(false); // Reset intent when navigating
    }
  };

  const handleBack = () => {
    // Allow going back without validation
    setStep(s => s - 1);
    // Clear errors when going back to allow re-editing
    setErrors({});
    setUserIntentToSubmit(false); // Reset intent when navigating
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Only allow submit if we're actually on step 6 AND user clicked submit button
    if (step !== 6 || !userIntentToSubmit) {
      return;
    }
    
    if (!validateStep(6)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        patient_id: form.patientId,
        act_date: form.date,
        act_type: form.actType,
        category: form.category,
        diagnosis: form.diagnosis,
        doctor_id: form.doctorId || null,
        report: form.report || null,
        amount: form.amount ? String(form.amount) : null,
        status: form.status,
        treatment: form.treatment && form.treatment.length > 0 ? form.treatment : null,
        notes: form.notes || null,
      };

      let actId = form.id;
      if (isEdit && form.id) {
        await updateMedicalAct(form.id, payload);
      } else {
        const res = await createMedicalAct(payload);
        actId = res.data?.id;
      }

      // Link FormCsRd if one was created and care type was selected
      // Link clinical form if one was created
      const finalFormId = form.formId || form.formCsRdId;
      if (form.formName && finalFormId && actId) {
        // Find the form type to get ref_form_type_id
        const selectedFormType = formTypes.find(ft => ft.form_name === form.formName);
        if (selectedFormType) {
          try {
            console.log(`Linking form ${finalFormId} to act ${actId} with form type ${selectedFormType.id}`);
            await linkFormToAct(actId, selectedFormType.id, finalFormId);
            console.log('Form linked successfully');
          } catch (linkErr) {
            console.error('Error linking form to act:', linkErr);
            // Non-fatal error for the user, but log it
          }
        } else {
          console.warn(`Form type ${form.formName} not found in catalog, cannot link.`);
        }
      } else {
        console.log('No clinical form to link:', { formName: form.formName, formId: finalFormId });
      }

      // If a dynamic template was selected and the admin filled it, submit its response tied to the created act
      if (selectedDynamicTemplate && dynamicFormData && Object.keys(dynamicFormData).length > 0 && actId) {
        try {
          await submitDynamicResponse({ act_id: actId, template_id: selectedDynamicTemplate.id, response_data: dynamicFormData });
          console.log('Dynamic form response submitted for act', actId);
        } catch (dynErr) {
          console.error('Error submitting dynamic form response:', dynErr);
          // non-fatal, continue
        }
      }
      
      // Create lab results if any were added
      if (form.labResults.length > 0 && actId) {
        for (const labResult of form.labResults) {
          await createActResult({
            act_id: actId,
            patient_id: form.patientId,
            result_date: labResult.date,
            result_name: labResult.name,
            result_value: labResult.value,
            result_unit: labResult.unit || null,
            result_category: labResult.category || null,
            is_abnormal: labResult.abnormal || false,
            notes: labResult.notes || null,
          });
        }
      }

      setSubmitted(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }, 1400);
    } catch (err) {
      setErrors({ submit: "Erreur lors de l'enregistrement de l'acte." });
    } finally {
      setIsSubmitting(false);
      setUserIntentToSubmit(false);
    }
  };

  if (submitted) {
    return (
      <div className="maf-success">
        <div className="maf-success-icon">
          <FiCheck />
        </div>
        <h3>{isEdit ? 'Acte modifié avec succès !' : 'Acte enregistré avec succès !'}</h3>
        <p>L'acte médical pour {form.patientName} a été {isEdit ? 'mis à jour' : 'validé'}.</p>
      </div>
    );
  }

  return (
    <div className="maf-wrapper">
      {/* Header */}
      <div className="maf-header">
        <div className="maf-header-left">
          <div className="maf-header-icon">
            {isEdit ? <FiEdit3 /> : <FiPlus />}
          </div>
          <div>
            <h2 className="maf-title">{isEdit ? 'Modifier l\'acte' : 'Nouvel Acte Médical'}</h2>
            <p className="maf-subtitle">{isEdit ? 'Modifiez les détails de l\'acte' : 'Remplissez les informations de l\'acte'}</p>
          </div>
        </div>
        {onClose && (
          <button className="maf-close-btn" onClick={onClose} type="button" aria-label="Fermer">
            <FiX />
          </button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="maf-steps">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isCompleted = step > s.id;
          const isActive = step === s.id;
          return (
            <React.Fragment key={s.id}>
              <div className={`maf-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                <div className="maf-step-circle">
                  {isCompleted ? <FiCheck /> : <Icon />}
                </div>
                <span className="maf-step-label">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`maf-step-line ${isCompleted ? 'completed' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Form */}
      <form className="maf-form" onSubmit={handleSubmit} noValidate>
        {/* Step 1 — Patient & Date */}
        {step === 1 && (
          <div className="maf-section">
            <div className="maf-section-title">
              <FiUser className="maf-section-icon" />
              <span>Sélectionner le patient</span>
            </div>

            {/* Patient Search */}
            <div className="maf-field">
              <label className="maf-label">
                Patient <span className="maf-required">*</span>
              </label>
              <div className="maf-search-wrapper">
                <FiSearch className="maf-search-icon" />
                <input
                  type="text"
                  className="maf-input maf-input-with-icon"
                  placeholder="Rechercher par nom ou IPP..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Patient List with Virtual Scrolling */}
            <div className="maf-patient-list">
              {isLoadingPatients ? (
                <div className="maf-loading">Chargement des patients...</div>
              ) : filteredPatients.length === 0 ? (
                <div className="maf-empty">Aucun patient trouvé</div>
              ) : (
                <List
                  height={350}
                  itemCount={filteredPatients.length}
                  itemSize={80}
                  width="100%"
                >
                  {({ index, style }) => {
                    const p = filteredPatients[index];
                    return (
                      <div
                        style={style}
                        className={`maf-patient-card ${form.patientId === p.id ? 'selected' : ''}`}
                        onClick={() => selectPatient(p)}
                      >
                        <div className="maf-patient-avatar">
                          {p.gender === 'Femme' ? '👩' : '👨'}
                        </div>
                        <div className="maf-patient-info">
                          <span className="maf-patient-name">{p.first_name} {p.last_name}</span>
                          <span className="maf-patient-meta">
                            {p.ipp ? `IPP: ${p.ipp}` : 'Sans IPP'} • {p.age || '?'} ans
                          </span>
                        </div>
                        {form.patientId === p.id && (
                          <div className="maf-patient-check">
                            <FiCheck />
                          </div>
                        )}
                      </div>
                    );
                  }}
                </List>
              )}
            </div>
            {errors.patientId && <span className="maf-error-msg"><FiAlertCircle />{errors.patientId}</span>}

            {/* Date */}
            <div className="maf-field" style={{ marginTop: '20px' }}>
              <label className="maf-label">
                Date de l'acte <span className="maf-required">*</span>
              </label>
              <div className="maf-input-icon-wrapper">
                <FiCalendar className="maf-input-icon" />
                <input
                  type="date"
                  name="date"
                  className={`maf-input maf-input-with-icon ${errors.date ? 'maf-input-error' : ''}`}
                  value={form.date}
                  onChange={handleChange}
                />
              </div>
              {errors.date && <span className="maf-error-msg"><FiAlertCircle />{errors.date}</span>}
            </div>
          </div>
        )}

        {/* Step 2 — Form Type Selection */}
        {step === 2 && (
          <div className="maf-section">
            <div className="maf-section-title">
              <FiActivity className="maf-section-icon" />
              <span>Type de forme clinique</span>
            </div>

            <div className="maf-field">
              <label className="maf-label">
                Type de soin <span className="maf-required">*</span>
              </label>
              <select
                value={form.careTypeId}
                onChange={(e) => handleCareTypeSelect(e.target.value)}
                className={`maf-input ${errors.careTypeId ? 'maf-input-error' : ''}`}
              >
                <option value="">-- Sélectionner --</option>
                {careTypes.map(ct => (
                  <option key={`ct_${ct.id}`} value={ct.id}>
                    {ct.label}
                  </option>
                ))}
                {dynamicTemplates.length > 0 && <optgroup label="Formulaires Personnalisés" />}
                {dynamicTemplates.map(dt => (
                  <option key={`dynamic_${dt.id}`} value={`dynamic_${dt.id}`}>
                    {dt.title}
                  </option>
                ))}
              </select>
              {errors.careTypeId && <span className="maf-error-msg"><FiAlertCircle />{errors.careTypeId}</span>}
            </div>

            {form.careTypeId && !String(form.careTypeId).startsWith('dynamic_') && actTypes.length > 0 && (
              <div className="maf-field">
                <label className="maf-label">Type d'acte associé</label>
                <p className="maf-hint">{actTypes.length} type(s) d'acte(s) disponible(s)</p>
                {actTypes.map(at => (
                  <div key={at.id} className="maf-form-selector">
                    <span className="maf-form-label">{at.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Form Data Entry (FormCsRd or placeholder) */}
        {step === 3 && (
          <div className="maf-section">
            <div className="maf-section-title">
              <FiTarget className="maf-section-icon" />
              <span>Données de forme clinique</span>
            </div>
            
            {selectedDynamicTemplate ? (
              <div style={{ marginTop: '1rem' }}>
                <div className="info-box maf-clinical-sticky-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiCheckCircle style={{ color: '#10b981' }} />
                    <span>Formulaire dynamique: <strong>{selectedDynamicTemplate.title}</strong></span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>Formulaire personnalisé</span>
                </div>

                <DynamicFormRenderer
                  template={selectedDynamicTemplate}
                  formData={dynamicFormData}
                  setFormData={setDynamicFormData}
                />

                {dynamicSaved && (
                  <span className="maf-dynamic-save-badge">Réponses prêtes à enregistrer</span>
                )}
              </div>
            ) : form.careTypeId && form.formName && FORM_COMPONENT_MAP[form.formName] ? (
              // Form automatically selected and rendered - no dropdown needed
              <ClinicalFormWrapper
                formName={form.formName}
                formTypes={formTypes}
                formId={form.formId}
                form={form}
                setForm={setForm}
                FORM_COMPONENT_MAP={FORM_COMPONENT_MAP}
                FORM_CRUD_MAP={FORM_CRUD_MAP}
                toast={toast}
              />
            ) : form.careTypeId && formTypes.length === 0 ? (
              <div className="maf-form-note">
                <p>⚠️ Chargement du formulaire...</p>
              </div>
            ) : form.careTypeId && formTypes.length > 0 ? (
              <div className="maf-form-note">
                <p>⚠️ Formulaire en cours de sélection...</p>
              </div>
            ) : (
              <div className="maf-form-note">
                <p>ℹ️ Veuillez d'abord sélectionner un type de soin à l'étape précédente.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 4 — Clinical Details (Previous Step 2) */}
        {step === 4 && (
          <div className="maf-section">
            <div className="maf-section-title">
              <FiActivity className="maf-section-icon" />
              <span>Détails cliniques</span>
            </div>

            {/* Act Type */}
            <div className="maf-field">
              <label className="maf-label">
                Type d'acte <span className="maf-required">*</span>
              </label>
              <div className="maf-type-grid">
                {ACT_TYPES.map(type => (
                  <div
                    key={type.value}
                    className={`maf-type-card ${form.actType === type.value ? 'selected' : ''}`}
                    onClick={() => setForm(prev => ({ ...prev, actType: type.value }))}
                  >
                    <span className="maf-type-icon">{type.icon}</span>
                    <span className="maf-type-label">{type.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category */}
            <div className="maf-field">
              <label className="maf-label">Catégorie</label>
              <div className="maf-category-group">
                {CATEGORY_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`maf-category-chip ${form.category === opt.value ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={opt.value}
                      checked={form.category === opt.value}
                      onChange={handleChange}
                      hidden
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Doctor */}
            <div className="maf-field">
              <label className="maf-label">
                Médecin responsable <span className="maf-required">*</span>
              </label>
              <select
                name="doctorId"
                className={`maf-input ${errors.doctorId ? 'maf-input-error' : ''}`}
                value={form.doctorId}
                onChange={handleChange}
              >
                <option value="">-- Sélectionner un médecin --</option>
                {doctors.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.first_name} {doc.last_name} {doc.specialization ? `(${doc.specialization})` : ''}
                  </option>
                ))}
              </select>
              {errors.doctorId && <span className="maf-error-msg"><FiAlertCircle />{errors.doctorId}</span>}
            </div>

            {/* Diagnosis */}
            <div className="maf-field">
              <label className="maf-label">
                Diagnostic <span className="maf-required">*</span>
              </label>
              <input
                type="text"
                name="diagnosis"
                className={`maf-input ${errors.diagnosis ? 'maf-input-error' : ''}`}
                placeholder="Ex: Polyarthrite Rhumatoïde"
                value={form.diagnosis}
                onChange={handleChange}
              />
              {errors.diagnosis && <span className="maf-error-msg"><FiAlertCircle />{errors.diagnosis}</span>}
            </div>

            {/* Report */}
            <div className="maf-field">
              <label className="maf-label">Rapport clinique</label>
              <textarea
                name="report"
                className="maf-textarea"
                placeholder="Détails de l'examen, observations..."
                rows={4}
                value={form.report}
                onChange={handleChange}
              />
            </div>
          </div>
        )}

        {/* Step 5 — Lab Results */}
        {step === 5 && (
          <div className="maf-section">
            <div className="maf-section-title">
              <FiTarget className="maf-section-icon" />
              <span>Résultats de laboratoire</span>
            </div>
            
            {form.labResults.length > 0 && (
              <div className="maf-lab-results-list">
                {form.labResults.map((result, idx) => (
                  <div key={idx} className="maf-lab-result-item">
                    <div className="maf-lab-result-content">
                      <div className="maf-lab-result-header">
                        <span className="maf-lab-result-name">{result.name}</span>
                        <span className="maf-lab-result-value">{result.value} {result.unit}</span>
                      </div>
                      <span className="maf-lab-result-date">{result.date}</span>
                      {result.abnormal && <span className="maf-lab-result-abnormal">Anormal</span>}
                    </div>
                    <button
                      type="button"
                      className="maf-lab-result-remove"
                      onClick={() => setForm(prev => ({
                        ...prev,
                        labResults: prev.labResults.filter((_, i) => i !== idx)
                      }))}
                    >
                      <FiX />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="maf-lab-result-form">
              <div className="maf-grid-2">
                <div className="maf-field">
                  <label className="maf-label">Analyse</label>
                  <input
                    type="text"
                    id="lab-name"
                    className="maf-input"
                    placeholder="Ex: Glycémie"
                  />
                </div>
                <div className="maf-field">
                  <label className="maf-label">Valeur</label>
                  <input
                    type="text"
                    id="lab-value"
                    className="maf-input"
                    placeholder="Ex: 95"
                  />
                </div>
              </div>
              
              <div className="maf-grid-2">
                <div className="maf-field">
                  <label className="maf-label">Unité</label>
                  <input
                    type="text"
                    id="lab-unit"
                    className="maf-input"
                    placeholder="Ex: mg/dL"
                  />
                </div>
                <div className="maf-field">
                  <label className="maf-label">Date</label>
                  <input
                    type="date"
                    id="lab-date"
                    className="maf-input"
                    defaultValue={form.date}
                  />
                </div>
              </div>
              
              <div className="maf-field">
                <label className="maf-label">Catégorie</label>
                <select id="lab-category" className="maf-input">
                  <option value="">-- Sélectionner --</option>
                  <option value="Hématologie">Hématologie</option>
                  <option value="Biochimie">Biochimie</option>
                  <option value="Immunologie">Immunologie</option>
                  <option value="Microbiologie">Microbiologie</option>
                </select>
              </div>
              
              <div className="maf-field checkbox">
                <label>
                  <input type="checkbox" id="lab-abnormal" />
                  <span>Résultat anormal</span>
                </label>
              </div>
              
              <div className="maf-field">
                <label className="maf-label">Notes</label>
                <textarea
                  id="lab-notes"
                  className="maf-textarea"
                  placeholder="Observations supplémentaires..."
                  rows={2}
                />
              </div>
              
              <button
                type="button"
                className="maf-btn-add-lab"
                onClick={() => {
                  const name = document.getElementById('lab-name').value.trim();
                  const value = document.getElementById('lab-value').value.trim();
                  if (!name || !value) {
                    toast.warning('Veuillez entrer l\'analyse et la valeur');
                    return;
                  }
                  setForm(prev => ({
                    ...prev,
                    labResults: [...prev.labResults, {
                      name,
                      value,
                      unit: document.getElementById('lab-unit').value.trim(),
                      date: document.getElementById('lab-date').value,
                      category: document.getElementById('lab-category').value || null,
                      abnormal: document.getElementById('lab-abnormal').checked,
                      notes: document.getElementById('lab-notes').value.trim() || null,
                    }]
                  }));
                  document.getElementById('lab-name').value = '';
                  document.getElementById('lab-value').value = '';
                  document.getElementById('lab-unit').value = '';
                  document.getElementById('lab-category').value = '';
                  document.getElementById('lab-abnormal').checked = false;
                  document.getElementById('lab-notes').value = '';
                }}
              >
                <FiPlus /> Ajouter un résultat
              </button>
            </div>
          </div>
        )}

        {/* Step 6 — Billing */}
        {step === 6 && (
          <div className="maf-section">
            <div className="maf-section-title">
              <FiDollarSign className="maf-section-icon" />
              <span>Facturation & Finalisation</span>
            </div>

            <div className="maf-grid-2">
              {/* Amount */}
              <div className="maf-field">
                <label className="maf-label">
                  Montant (DH) <span className="maf-required">*</span>
                </label>
                <div className="maf-input-icon-wrapper">
                  <FiDollarSign className="maf-input-icon" />
                  <input
                    type="number"
                    name="amount"
                    className={`maf-input maf-input-with-icon ${errors.amount ? 'maf-input-error' : ''}`}
                    placeholder="0.00"
                    value={form.amount}
                    onChange={handleChange}
                  />
                </div>
                {errors.amount && <span className="maf-error-msg"><FiAlertCircle />{errors.amount}</span>}
              </div>

              {/* Status */}
              <div className="maf-field">
                <label className="maf-label">Statut</label>
                <div className="maf-status-group">
                  <label className={`maf-status-chip completed ${form.status === 'completed' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="status"
                      value="completed"
                      checked={form.status === 'completed'}
                      onChange={handleChange}
                      hidden
                    />
                    <FiCheck /> Terminé
                  </label>
                  <label className={`maf-status-chip pending ${form.status === 'pending' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="status"
                      value="pending"
                      checked={form.status === 'pending'}
                      onChange={handleChange}
                      hidden
                    />
                    <FiClock /> En cours
                  </label>
                </div>
              </div>
            </div>

            <TreatmentPrescriptionPanel
              treatments={Array.isArray(form.treatment) ? form.treatment : []}
              onChange={(treatment) => setForm((prev) => ({ ...prev, treatment }))}
            />

            {/* Notes */}
            <div className="maf-field">
              <label className="maf-label">Notes additionnelles</label>
              <textarea
                name="notes"
                className="maf-textarea"
                placeholder="Observations, commentaires..."
                rows={2}
                value={form.notes}
                onChange={handleChange}
              />
            </div>

            {errors.submit && (
              <div className="maf-error-banner">
                <FiAlertCircle /> {errors.submit}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="maf-nav">
          {step > 1 ? (
            <button type="button" className="maf-btn-back" onClick={handleBack}>
              <FiChevronLeft /> Précédent
            </button>
          ) : (
            <div />
          )}

          <div className="maf-nav-right">
            <button type="button" className="maf-btn-cancel" onClick={onClose}>
              Annuler
            </button>
            {step < 6 ? (
              <button type="button" className="maf-btn-next" onClick={handleNext} disabled={isAutoSavingForm}>
                {isAutoSavingForm ? 'Enregistrement...' : <>Suivant <FiChevronRight /></>}
              </button>
            ) : (
              <button 
                type="submit" 
                className="maf-btn-submit" 
                disabled={isSubmitting}
                onClick={() => setUserIntentToSubmit(true)}
              >
                {isSubmitting ? 'Enregistrement...' : (isEdit ? "Modifier l'acte" : "Valider l'acte")}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

export default MedicalActForm;
