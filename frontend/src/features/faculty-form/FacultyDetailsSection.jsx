import React from 'react';

/**
 * FacultyDetailsSection Component
 *
 * Renders inputs for:
 * - Faculty Name
 * - Faculty ID
 *
 * Displays field-level validation errors and preserves user input.
 */
export function FacultyDetailsSection({
  facultyDetails = { faculty_name: '', faculty_id: '' },
  onChange = () => {},
  errors = {},
  disabled = false,
}) {
  const handleNameChange = (e) => {
    onChange('faculty_name', e.target.value);
  };

  const handleIdChange = (e) => {
    onChange('faculty_id', e.target.value);
  };

  return (
    <div className="portal-card" data-testid="faculty-details-section">
      <h2 className="card-title">
        <span className="step-number">1</span>
        <span>Faculty Information</span>
      </h2>

      <div className="form-grid">
        {/* Faculty Name */}
        <div className="form-group">
          <label htmlFor="faculty_name" className="form-label">
            Full Name <span className="required-mark" aria-hidden="true">*</span>
          </label>
          <input
            id="faculty_name"
            name="faculty_name"
            type="text"
            className={`form-input ${errors.faculty_name ? 'has-error' : ''}`}
            placeholder="e.g. Dr. Jane Smith"
            value={facultyDetails.faculty_name || ''}
            onChange={handleNameChange}
            disabled={disabled}
            aria-required="true"
            aria-invalid={Boolean(errors.faculty_name)}
            aria-describedby={errors.faculty_name ? 'error-faculty-name' : undefined}
          />
          {errors.faculty_name && (
            <span id="error-faculty-name" className="field-error-message" role="alert">
              {errors.faculty_name}
            </span>
          )}
        </div>

        {/* Faculty ID */}
        <div className="form-group">
          <label htmlFor="faculty_id" className="form-label">
            Faculty ID / Employee ID <span className="required-mark" aria-hidden="true">*</span>
          </label>
          <input
            id="faculty_id"
            name="faculty_id"
            type="text"
            className={`form-input ${errors.faculty_id ? 'has-error' : ''}`}
            placeholder="e.g. FAC-2026-001"
            value={facultyDetails.faculty_id || ''}
            onChange={handleIdChange}
            disabled={disabled}
            aria-required="true"
            aria-invalid={Boolean(errors.faculty_id)}
            aria-describedby={errors.faculty_id ? 'error-faculty-id' : undefined}
          />
          {errors.faculty_id && (
            <span id="error-faculty-id" className="field-error-message" role="alert">
              {errors.faculty_id}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default FacultyDetailsSection;
