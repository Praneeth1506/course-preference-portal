import React from 'react';

/**
 * CourseSelect Component
 *
 * Renders course options for a specific preference question.
 *
 * Requirements:
 * - Uses stable course IDs for option values.
 * - Disables courses selected in other questions with a clear explanation:
 *   "Already selected for another preference".
 * - Allows the currently selected course in this question to remain selectable.
 * - Displays course code, name, and department where available.
 */
export function CourseSelect({
  questionId,
  courses = [],
  selectedCourseId = null,
  onSelect = () => {},
  disabled = false,
  hasError = false,
}) {
  const selectId = `course-select-${questionId}`;

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const handleChange = (e) => {
    const val = e.target.value;
    onSelect(val === '' ? null : val);
  };

  return (
    <div className="select-control-wrapper">
      <label htmlFor={selectId} className="visually-hidden" style={{ display: 'none' }}>
        Select Course
      </label>
      <select
        id={selectId}
        className={`course-dropdown ${hasError ? 'has-error' : ''}`}
        value={selectedCourseId || ''}
        onChange={handleChange}
        disabled={disabled || courses.length === 0}
        aria-invalid={hasError}
        aria-describedby={hasError ? `error-${questionId}` : undefined}
      >
        <option value="">-- Choose a course preference --</option>
        {courses.map((course) => {
          const codePrefix = course.code ? `[${course.code}] ` : '';
          const deptSuffix = course.department ? ` (${course.department})` : '';
          const disabledNotice = course.isDisabled ? ' — (Already selected for another preference)' : '';

          return (
            <option
              key={course.id}
              value={course.id}
              disabled={course.isDisabled}
            >
              {codePrefix}{course.name}{deptSuffix}{disabledNotice}
            </option>
          );
        })}
      </select>

      {/* Selected Course Confirmation Preview */}
      {selectedCourse && (
        <div className="selected-course-preview" data-testid={`preview-${questionId}`}>
          <div className="preview-details">
            {selectedCourse.code && <span className="preview-code">{selectedCourse.code}</span>}
            <span className="preview-name">{selectedCourse.name}</span>
          </div>
          <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>Selected</span>
        </div>
      )}
    </div>
  );
}

export default CourseSelect;
