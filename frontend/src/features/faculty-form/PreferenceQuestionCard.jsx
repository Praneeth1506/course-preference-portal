import React from 'react';
import { CourseSelect } from './CourseSelect.jsx';

/**
 * PreferenceQuestionCard Component
 *
 * Renders an individual preference question card with:
 * - Preference index and title
 * - Course select dropdown with disabled options for duplicate prevention
 * - Warning when no courses are available
 * - Clear selection button
 * - Question validation error message
 */
export function PreferenceQuestionCard({
  question,
  questionIndex,
  availableCourses = [],
  selectedCourseId = null,
  onSelect = () => {},
  onClear = () => {},
  error = null,
  disabled = false,
}) {
  const preferenceLabel = `Preference ${questionIndex + 1}`;
  const semesterLabel =
    question.semester !== undefined && question.semester !== null
      ? `Semester ${question.semester}`
      : 'All Semesters';
  const hasCourses = !question.hasNoCourses && availableCourses.length > 0;

  return (
    <div
      className={`portal-card preference-card ${error ? 'has-error' : ''}`}
      data-testid={`question-card-${question.id}`}
    >
      <div className="preference-card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="preference-badge">{preferenceLabel}</span>
            <span className="semester-badge" data-testid={`semester-badge-${question.id}`}>
              {semesterLabel}
            </span>
          </div>
          <h3 className="question-title">{question.title}</h3>
        </div>

        {selectedCourseId && !disabled && (
          <button
            type="button"
            className="btn-clear-selection"
            onClick={onClear}
            title="Clear this selection"
            data-testid={`clear-btn-${question.id}`}
          >
            Clear choice
          </button>
        )}
      </div>

      {question.hasNoCourses && (
        <div className="card-alert card-alert-warning" role="alert">
          <span>⚠️</span>
          <span>
            No course options are currently assigned to this preference. This question is optional and will not prevent you from submitting.
          </span>
        </div>
      )}

      {hasCourses && (
        <CourseSelect
          questionId={question.id}
          courses={availableCourses}
          selectedCourseId={selectedCourseId}
          onSelect={onSelect}
          disabled={disabled}
          hasError={Boolean(error)}
        />
      )}

      {error && (
        <div
          id={`error-${question.id}`}
          className="field-error-message"
          role="alert"
          style={{ marginTop: '0.5rem' }}
          data-testid={`error-${question.id}`}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default PreferenceQuestionCard;
