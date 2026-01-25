interface Window {
	patientId?: string
	idpatient?: string
	AIDEN_DEBUG?: boolean
}

interface PatientInfo {
	id: string | null
	lastname: string | null
	firstname: string | null
	/** format YYYY-MM-DD */
	birthDate: string | null
	sex: 'M' | 'W' | null
	email: string | null
	/** URL de la page d'où proviennent les données */
	url: string
}
