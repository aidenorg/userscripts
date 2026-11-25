/** Un appel à l'API de WeClever, confié par l'application bureau. */
interface WecleverCall {
	id: string
	method: 'GET' | 'POST'
	/** Chemin sous `/api`, requête comprise. */
	path: string
	body?: unknown
}

/** La réponse de WeClever, corps en base64 : un PDF passe comme un JSON. */
interface WecleverResult {
	status: number
	contentType: string
	base64: string
}

/** Champs lus dans `GET /api/contact/find/<id>`. */
interface WecleverContact {
	id: number
	/** Numéro de dossier. */
	nbr: number | null
	vatech_chart_number: string | null
	lastname: string | null
	firstname: string | null
	/** Minuit UTC, ISO. */
	birthday: string | null
	/** 1 : homme, 2 : femme. */
	sex: number | null
	email: string | null
	phones: { nbr: string; phoneTypeName: string }[] | null
}
