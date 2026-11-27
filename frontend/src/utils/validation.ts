const EMAIL_MAX_LENGTH = 254

export type ValidationResult = {
  valid: boolean
  message: string
}

function result(message = ''): ValidationResult {
  return {
    valid: message.length === 0,
    message,
  }
}


export function validateFullName(value: string): ValidationResult {
  const name = value.trim()
  const length = [...name].length
  if (!name) return result('Full name is required.')
  if (length > 60) return result('Full name must be 60 characters or fewer.')
  if (!/^[\p{L}\p{M}]+(?:[ ]+[\p{L}\p{M}]+)*$/u.test(name))
    return result('Use letters and ordinary spaces only.')
  return result()
}

export function validateEmail(value: string): ValidationResult {
  const email = value.trim()

  if (!email) {
    return result('Email address is required.')
  }

  if (email.length > EMAIL_MAX_LENGTH) {
    return result('Email address must be 254 characters or fewer.')
  }

  // Basic format check; the backend IsEmail validator remains authoritative.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return result('Enter a valid email address, for example name@company.com.')
  }

  return result()
}


export function validateOrganizationName(value: string): ValidationResult {
  const name = value.trim()
  const length = [...name].length
  if (!name) return result('Organization name is required.')
  if (length < 2 || length > 150)
    return result('Organization name must be 2–150 characters.')
  if (!/[\p{L}\p{N}]/u.test(name) || !/^[\p{L}\p{M}\p{N} &.,'-]+$/u.test(name))
    return result("Use letters, numbers, spaces, and these symbols only: & . , - '.")
  return result()
}


export function validatePassword(value: string): ValidationResult {
  if (value.length < 10) return result('Password must be at least 10 characters.')
  if (value.length > 128) return result('Password must be 128 characters or fewer.')
  return result()
}

export function validateInvitationToken(
  value: string,
): ValidationResult {
  const token = value.trim()

  if (!token) {
    return result('Invitation token is required.')
  }

  if (token.length > 128) {
    return result('Invitation token must be 128 characters or fewer.')
  }

  return result()
}

export function validateRequiredText(
  value: string,
  label: string,
  maxLength: number,
): ValidationResult {
  const text = value.trim()

  if (!text) {
    return result(`${label} is required.`)
  }

  if (text.length > maxLength) {
    return result(`${label} must be ${maxLength} characters or fewer.`)
  }

  return result()
}

export function validateOptionalText(
  value: string,
  label: string,
  maxLength: number,
): ValidationResult {
  if (value && value.trim().length > maxLength) {
    return result(`${label} must be ${maxLength} characters or fewer.`)
  }

  return result()
}