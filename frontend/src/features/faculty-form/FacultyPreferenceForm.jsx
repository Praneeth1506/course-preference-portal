import React, { useState, useEffect, useReducer } from 'react';
import './facultyForm.css';
import {
  validateFormData,
  validateFacultyFormSubmission,
  initializeSelections,
  selectCourse,
  clearSelection,
  getCourseAvailabilityForQuestion,
  submissionReducer,
  initialSubmissionState,
  submitFacultyFormWorkflow,
} from './facultyFormLogic.js';
import { fetchPublicForm, submitFacultyResponse } from './facultyFormApi.js';
import { extractTokenFromUrl } from './facultyFormUrl.js';
import { FacultyDetailsSection } from './FacultyDetailsSection.jsx';
import { PreferenceQuestionCard } from './PreferenceQuestionCard.jsx';
import { SubmissionFeedback } from './SubmissionFeedback.jsx';

/**
 * Demo fallback form data for evaluation when no backend is running
 */
const DEMO_FALLBACK_FORM = {
  token: 'demo-spring-2026',
  title: 'Spring 2026 Computer Science Course Preference Form',
  description:
    'Please select your preferred teaching assignments for the upcoming semester. You may select each course for at most one preference slot.',
  questions: [
    {
      id: 'q-pref-1',
      title: 'First Preference (Primary Teaching Choice)',
      order: 1,
      courses: [
        { id: 'cs-101', code: 'CS101', name: 'Introduction to Programming in Python', department: 'CS' },
        { id: 'cs-201', code: 'CS201', name: 'Data Structures and Algorithms', department: 'CS' },
        { id: 'cs-301', code: 'CS301', name: 'Operating Systems', department: 'CS' },
        { id: 'cs-401', code: 'CS401', name: 'Artificial Intelligence', department: 'CS' },
      ],
    },
    {
      id: 'q-pref-2',
      title: 'Second Preference (Secondary Teaching Choice)',
      order: 2,
      courses: [
        { id: 'cs-101', code: 'CS101', name: 'Introduction to Programming in Python', department: 'CS' },
        { id: 'cs-201', code: 'CS201', name: 'Data Structures and Algorithms', department: 'CS' },
        { id: 'cs-302', code: 'CS302', name: 'Computer Networks', department: 'CS' },
        { id: 'cs-401', code: 'CS401', name: 'Artificial Intelligence', department: 'CS' },
      ],
    },
    {
      id: 'q-pref-3',
      title: 'Third Preference (Alternative Choice)',
      order: 3,
      courses: [
        { id: 'cs-201', code: 'CS201', name: 'Data Structures and Algorithms', department: 'CS' },
        { id: 'cs-301', code: 'CS301', name: 'Operating Systems', department: 'CS' },
        { id: 'cs-302', code: 'CS302', name: 'Computer Networks', department: 'CS' },
        { id: 'cs-402', code: 'CS402', name: 'Database Management Systems', department: 'CS' },
      ],
    },
  ],
};

/**
 * FacultyPreferenceForm Component
 *
 * Main public-facing faculty form:
 * - Dynamically loads form metadata and variable number of questions
 * - Manages faculty details (name, id) and course selections
 * - Enforces duplicate course prevention using Phase 1 rules
 * - Handles full submission lifecycle with retry and input preservation
 */
export function FacultyPreferenceForm({
  initialToken = '',
  initialFormData = null,
  apiClient = { fetchPublicForm, submitFacultyResponse },
}) {
  const [token, setToken] = useState(() => initialToken || extractTokenFromUrl());
  const [manualTokenInput, setManualTokenInput] = useState('');

  const [form, setForm] = useState(() => {
    if (initialFormData) {
      const parsed = validateFormData(initialFormData);
      return parsed.isValid ? parsed.normalizedForm : null;
    }
    return null;
  });

  const [isLoadingForm, setIsLoadingForm] = useState(() => Boolean(!initialFormData && (initialToken || extractTokenFromUrl())));
  const [formLoadError, setFormLoadError] = useState(null);

  const [facultyDetails, setFacultyDetails] = useState({
    faculty_name: '',
    faculty_id: '',
  });

  const [selections, setSelections] = useState(() => (form ? initializeSelections(form) : {}));
  const [validationErrors, setValidationErrors] = useState({});
  const [submissionState, dispatch] = useReducer(submissionReducer, initialSubmissionState);
  const [submittedSummary, setSubmittedSummary] = useState(null);

  // Load form when token changes and form is not yet set
  useEffect(() => {
    let ignore = false;

    if (!token || form) {
      return undefined;
    }

    async function executeFetch() {
      try {
        let rawData;
        if (token === 'demo-spring-2026' || token === 'demo') {
          rawData = DEMO_FALLBACK_FORM;
        } else {
          rawData = await apiClient.fetchPublicForm(token);
        }

        if (ignore) return;

        const validation = validateFormData(rawData);
        if (!validation.isValid || !validation.normalizedForm) {
          throw new Error(validation.errors.join('; ') || 'Form schema is invalid.');
        }

        setForm(validation.normalizedForm);
        setSelections(initializeSelections(validation.normalizedForm));
      } catch (err) {
        if (!ignore) {
          setFormLoadError(err.message || 'Failed to load the course preference form.');
        }
      } finally {
        if (!ignore) {
          setIsLoadingForm(false);
        }
      }
    }

    executeFetch();

    return () => {
      ignore = true;
    };
  }, [token, form, apiClient]);

  // Handle Faculty Details Change
  const handleFacultyChange = (field, value) => {
    setFacultyDetails((prev) => ({ ...prev, [field]: value }));

    // Clear field-level error as user edits
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  // Handle Course Selection
  const handleCourseSelect = (questionId, courseId) => {
    if (!form) return;

    if (!courseId) {
      handleClearCourse(questionId);
      return;
    }

    const result = selectCourse(selections, questionId, courseId, form);
    if (result.success) {
      setSelections(result.selections);

      // Clear error on this question if present
      if (validationErrors.questions && validationErrors.questions[questionId]) {
        setValidationErrors((prev) => {
          const updatedQErrors = { ...(prev.questions || {}) };
          delete updatedQErrors[questionId];
          return { ...prev, questions: updatedQErrors };
        });
      }
    }
  };

  // Handle Clearing a Selection
  const handleClearCourse = (questionId) => {
    const result = clearSelection(selections, questionId);
    if (result.success) {
      setSelections(result.selections);
    }
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    if (!form) return;

    // Run client-side validation
    const validation = validateFacultyFormSubmission({ form, facultyDetails, selections });
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      dispatch({ type: 'VALIDATION_FAILED', payload: validation.errors });
      return;
    }

    setValidationErrors({});

    // Execute submission workflow
    const result = await submitFacultyFormWorkflow({
      token,
      form,
      facultyDetails,
      selections,
      submitApiFn: apiClient.submitFacultyResponse,
      dispatch,
      currentState: submissionState,
    });

    if (result.success) {
      // Record summary for confirmation view
      const chosenCoursesCount = Object.values(selections).filter(Boolean).length;
      setSubmittedSummary({
        faculty_name: validation.sanitizedDetails.faculty_name,
        faculty_id: validation.sanitizedDetails.faculty_id,
        formTitle: form.title,
        answersCount: chosenCoursesCount,
      });
    }
  };

  // Retry Handler
  const handleRetry = () => {
    handleSubmit();
  };

  // Reset to submit another response
  const handleSubmitAnother = () => {
    if (form) {
      setSelections(initializeSelections(form));
    }
    setFacultyDetails({ faculty_name: '', faculty_id: '' });
    setValidationErrors({});
    setSubmittedSummary(null);
    dispatch({ type: 'RESET' });
  };

  // Manual Token Entry Handler (when token is missing in URL)
  const handleManualTokenSubmit = (e) => {
    e.preventDefault();
    if (manualTokenInput.trim()) {
      setIsLoadingForm(true);
      setFormLoadError(null);
      setToken(manualTokenInput.trim());
    }
  };

  const isSubmitting = submissionState.isSubmitting;
  const isSuccess = submissionState.isSuccess;

  // Render Token Prompt if token is missing
  if (!token && !form) {
    return (
      <div className="faculty-portal-container" data-testid="token-prompt-screen">
        <header className="faculty-portal-header">
          <span className="portal-badge">Faculty Portal</span>
          <h1 className="portal-title">Course Preference Submission</h1>
          <p className="portal-description">
            Submit your teaching preferences for the upcoming academic session.
          </p>
        </header>

        <div className="token-prompt-card">
          <h2>Access Preference Form</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            Please enter your public form token or click the button below to load a demonstration form.
          </p>
          <form onSubmit={handleManualTokenSubmit} className="token-input-group">
            <input
              type="text"
              className="token-input"
              placeholder="e.g. spring-2026-cs"
              value={manualTokenInput}
              onChange={(e) => setManualTokenInput(e.target.value)}
              aria-label="Public Form Token"
            />
            <button type="submit" className="btn-primary" style={{ width: 'auto' }}>
              Load Form
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIsLoadingForm(true);
                setFormLoadError(null);
                setToken('demo-spring-2026');
              }}
              data-testid="btn-demo-form"
            >
              Load Sample Demo Form
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Loading Form Screen
  if (isLoadingForm) {
    return (
      <div className="faculty-portal-container" data-testid="loading-form-screen">
        <header className="faculty-portal-header">
          <span className="portal-badge">Faculty Portal</span>
          <h1 className="portal-title">Course Preference Form</h1>
        </header>
        <div className="portal-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <span className="spinner" style={{ borderColor: 'rgba(37, 99, 235, 0.3)', borderTopColor: '#2563eb', width: 28, height: 28 }} aria-hidden="true"></span>
          <p style={{ marginTop: '1rem', color: '#64748b' }}>Retrieving course preference form definition...</p>
        </div>
      </div>
    );
  }

  // Render Form Load Error
  if (formLoadError) {
    return (
      <div className="faculty-portal-container" data-testid="form-load-error-screen">
        <header className="faculty-portal-header">
          <span className="portal-badge">Faculty Portal</span>
          <h1 className="portal-title">Course Preference Form</h1>
        </header>
        <div className="feedback-error-banner" role="alert">
          <div className="error-banner-header">
            <span>⚠️</span>
            <span>Unable to Load Form</span>
          </div>
          <p className="error-banner-body">{formLoadError}</p>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIsLoadingForm(true);
                setFormLoadError(null);
                setForm(null);
              }}
            >
              Retry Loading Form
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setToken('');
                setForm(null);
                setFormLoadError(null);
                setIsLoadingForm(false);
              }}
            >
              Enter Different Token
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Success Confirmation
  if (isSuccess) {
    return (
      <div className="faculty-portal-container">
        <header className="faculty-portal-header">
          <span className="portal-badge">Faculty Portal</span>
          <h1 className="portal-title">{form?.title || 'Course Preference Form'}</h1>
        </header>

        <SubmissionFeedback
          submissionState={submissionState}
          onSubmitAnother={handleSubmitAnother}
          submittedSummary={submittedSummary}
        />
      </div>
    );
  }

  // Render Main Preference Form
  return (
    <div className="faculty-portal-container" data-testid="faculty-preference-form">
      {/* Header */}
      <header className="faculty-portal-header">
        <span className="portal-badge">Faculty Preference Portal</span>
        <h1 className="portal-title">{form?.title || 'Course Preference Form'}</h1>
        {form?.description && <p className="portal-description">{form.description}</p>}
      </header>

      {/* Submission Status Feedback (errors / spinner) */}
      <SubmissionFeedback
        submissionState={submissionState}
        onRetry={handleRetry}
        submittedSummary={submittedSummary}
      />

      <form onSubmit={handleSubmit} noValidate>
        {/* Step 1: Faculty Details */}
        <FacultyDetailsSection
          facultyDetails={facultyDetails}
          onChange={handleFacultyChange}
          errors={validationErrors}
          disabled={isSubmitting}
        />

        {/* Step 2: Course Preferences */}
        <div className="portal-card" style={{ marginBottom: '1.25rem' }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            <span className="step-number">2</span>
            <span>Select Course Preferences</span>
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.5rem 0 0' }}>
            Choose one distinct course for each preference. A course selected for one preference will be disabled for other preferences.
          </p>
        </div>

        {form?.questions?.map((question, index) => {
          const availableCourses = getCourseAvailabilityForQuestion(question, selections);
          const questionError = validationErrors.questions?.[question.id] || null;

          return (
            <PreferenceQuestionCard
              key={question.id}
              question={question}
              questionIndex={index}
              availableCourses={availableCourses}
              selectedCourseId={selections[question.id]}
              onSelect={(courseId) => handleCourseSelect(question.id, courseId)}
              onClear={() => handleClearCourse(question.id)}
              error={questionError}
              disabled={isSubmitting}
            />
          );
        })}

        {/* Actions Section */}
        <div className="portal-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
            data-testid="submit-preferences-btn"
          >
            {isSubmitting ? (
              <>
                <span className="spinner" aria-hidden="true"></span>
                <span>Submitting Preferences...</span>
              </>
            ) : (
              'Submit Preferences'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FacultyPreferenceForm;
