import React from 'react';

/**
 * SubmissionFeedback Component
 *
 * Renders user feedback across all submission lifecycle states:
 * - Submitting state (spinner indicator)
 * - Error state (alert banner with retry button, preserving user entries)
 * - Success state (confirmation screen with summary details)
 */
export function SubmissionFeedback({
  submissionState,
  onRetry = () => {},
  onSubmitAnother = () => {},
  submittedSummary = null,
}) {
  const { isSubmitting, isSuccess, isError, error, validationErrors } = submissionState;

  if (isSuccess) {
    return (
      <div className="feedback-card feedback-success" data-testid="feedback-success">
        <div className="feedback-success-icon" aria-hidden="true">
          ✓
        </div>
        <h2 className="feedback-success-title">Preferences Submitted Successfully!</h2>
        <p className="feedback-success-message">
          Thank you. Your course preferences have been recorded by the portal.
        </p>

        {submittedSummary && (
          <div className="submitted-summary-box">
            <h4 style={{ margin: '0 0 0.75rem', color: '#14532d', fontSize: '0.95rem' }}>
              Submission Summary
            </h4>
            <div className="submitted-summary-row">
              <span style={{ color: '#64748b' }}>Faculty Name:</span>
              <strong>{submittedSummary.faculty_name}</strong>
            </div>
            <div className="submitted-summary-row">
              <span style={{ color: '#64748b' }}>Faculty ID:</span>
              <strong>{submittedSummary.faculty_id}</strong>
            </div>
            {submittedSummary.formTitle && (
              <div className="submitted-summary-row">
                <span style={{ color: '#64748b' }}>Form:</span>
                <span>{submittedSummary.formTitle}</span>
              </div>
            )}
            <div className="submitted-summary-row">
              <span style={{ color: '#64748b' }}>Preferences Recorded:</span>
              <strong>{submittedSummary.answersCount} course(s)</strong>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn-secondary"
          onClick={onSubmitAnother}
          data-testid="btn-submit-another"
        >
          Submit another response
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Submission in progress indicator */}
      {isSubmitting && (
        <div className="card-alert card-alert-warning" role="status" data-testid="submission-progress">
          <span className="spinner" aria-hidden="true"></span>
          <span>Submitting your course preferences to the portal. Please wait...</span>
        </div>
      )}

      {/* Submission Error Banner */}
      {isError && (
        <div className="feedback-error-banner" role="alert" data-testid="feedback-error">
          <div className="error-banner-header">
            <span>⚠️</span>
            <span>Submission Error</span>
          </div>
          <p className="error-banner-body">
            {error?.message || 'An unexpected error occurred while saving your preferences.'}
          </p>

          {/* Validation errors summary list if present */}
          {validationErrors?.general && validationErrors.general.length > 0 && (
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', color: '#991b1b', fontSize: '0.875rem' }}>
              {validationErrors.general.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          )}

          {error?.isRetryable && (
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onRetry}
                data-testid="btn-retry"
                style={{ borderColor: '#f87171', color: '#991b1b' }}
              >
                Retry Submission
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default SubmissionFeedback;
