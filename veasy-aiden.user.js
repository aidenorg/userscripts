// ==UserScript==
// @name         Passerelle Veasy Aiden
// @description  Passerelle Veasy vers Aiden
// @author       Aiden
// @version      0.0.1
// @updateURL    https://raw.githubusercontent.com/aidenorg/userscripts/main/aiden-veasy.user.js
// @downloadURL  https://raw.githubusercontent.com/aidenorg/userscripts/main/aiden-veasy.user.js
// @match        https://patient.visiodent.com/*
// @icon         https://app.aiden.care/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/// <reference path="./veasy-aiden.d.ts" />

;(;() => {
	'use strict'

	window.AIDEN_DEBUG = true

	let timerId = setTimeout(init, 500)

	// Surveillance des changements de page (SPA)
	let lastUrl = window.location.href
	setInterval(() => {
		if (window.location.href !== lastUrl) {
			lastUrl = window.location.href
			clearTimeout(timerId)
			timerId = setTimeout(init, 500)
		}
	}, 2000)

	async function init() {
		const patient = await extractPatient()

		const patientInfosNameElement = document.querySelector('.patientInfosName')
		if (patientInfosNameElement) {
			const link = createAidenLink(patient)
			patientInfosNameElement.appendChild(link)
		}
	}

	/**
	 * @param {Patient} patient
	 */
	function createAidenLink(patient) {
		const link = document.createElement('a')
		link.style.float = 'right'
		link.style.width = '34px'
		link.style.height = '25px'
		link.style.border = '1px solid #3b4cf9'
		link.style.borderRadius = '10px'
		link.style.background = 'url(https://app.aiden.care/favicon.ico) #F5F5F5 no-repeat 8px 4px'
		link.style.cursor = patient.id ? 'pointer' : 'not-allowed'
		link.dataset.role = 'hint'
		link.dataset.hint = patient.id ? 'Ouvrir dans Aiden' : 'Patient non trouvé'
		link.title = 'Aiden'

		if (patient.id) {
			const aidenUrl = new URL('aiden://veasy/patient')
			aidenUrl.searchParams.set('id', patient.id)
			aidenUrl.searchParams.set('lastname', patient.lastname || '')
			aidenUrl.searchParams.set('firstname', patient.firstname || '')
			aidenUrl.searchParams.set('birthDate', patient.birthDate || '')
			aidenUrl.searchParams.set('sex', patient.sex || '')
			aidenUrl.searchParams.set('email', patient.email || '')
			aidenUrl.searchParams.set('url', patient.url)
			link.href = aidenUrl.toString()
		} else {
			link.style.filter = 'grayscale(100%) opacity(60%)'
		}

		return link
	}
	/**
	 * @returns {Promise<Patient>}
	 */
	async function extractPatient() {
		log('Extraction du patient...')

		await waitForElement(['#vdNav', '#vdTopBarPatientInfos'], 1000)

		const extract = extractFromCustomLinks()

		const patientId = extract.id || extractPatientId() || null
		let lastname = extract.lastname || null
		let firstname = extract.firstname || null
		if (!lastname || !firstname) {
			const name = extractName()
			if (name) {
				lastname = lastname || name.lastname
				firstname = firstname || name.firstname
			}
		}
		const birthDate = extract.birthDate || extractBirthDate()
		const sex = extract.sex || extractSex()
		const email = extract.email || extractEmail()

		/** @type {Patient} */
		const patient = {
			id: patientId,
			lastname,
			firstname,
			birthDate,
			sex,
			email,
			url: window.location.href,
		}

		log('Patient extrait:', patient)

		return patient
	}

	/**
	 * @returns {Partial<Patient>}
	 */
	function extractFromCustomLinks() {
		const customSchemeRegex =
			/^(?!https?:\/\/)(?!ftps?:\/\/)(?!mailto:)(?!javascript:)(?!data:)(?!file:)[a-z][a-z0-9+.-]*:\/\//i

		/** @type {NodeListOf<HTMLAnchorElement>} */
		const links = document.querySelectorAll('#vdNav a[href]')

		/** @type {Partial<Patient>} */
		const result = {}

		for (const link of links) {
			try {
				if (!customSchemeRegex.test(link.href)) continue

				let query = link.href.split('://')[1] || ''
				query = query.includes('?') ? query.split('?')[1] : query
				if (!query) continue

				query = query.replace(/;/g, '&')

				/** @type {Record<string, string>} */
				let params = {}

				try {
					const searchParams = new URLSearchParams(query)
					for (const [key, val] of searchParams.entries()) {
						const keyLower = key.toLowerCase()
						params[keyLower] = val
					}
				} catch (e) {
					log(`Erreur avec URLSearchParams sur "${query}":`, e)

					const pairs = query.split('&')
					for (const pair of pairs) {
						const [key, val] = pair.split('=')
						if (key) {
							const keyLower = key.toLowerCase()
							params[keyLower] = val ? decodeURIComponent(val) : ''
						}
					}
				}

				let patientId =
					params['patient_num_dossier'] ||
					params['identifiant_patient'] ||
					params['patient_identifiant'] ||
					params['identifiant'] ||
					params['id'] ||
					null

				if (patientId && !/^[0-9]+$/.test(patientId)) {
					patientId = null
				}

				const lastname = params['nom_patient'] || params['patient_nom'] || null
				const firstname = params['prenom_patient'] || params['patient_prenom'] || null

				const sexText = (params['patient_sexe'] || params['sexe'] || '').toUpperCase() || null
				const sex =
					sexText === 'H' || sexText === 'M' || sexText === 'HOMME'
						? 'M'
						: sexText === 'F' || sexText === 'W' || sexText === 'FEMME'
							? 'W'
							: null

				let birthDate = params['patient_date_naissance'] || params['date_naissance'] || null
				if (birthDate) {
					const slashSeparated = birthDate.includes('/')
					const dashSeparated = birthDate.includes('-')
					const startsWithYear = /^\d{4}/.test(birthDate)

					if (dashSeparated && !startsWithYear) {
						// JJ-MM-YYYY => YYYY-MM-DD
						const [day, month, year] = birthDate.split('-')
						if (day && month && year) birthDate = `${year}-${month}-${day}`
					} else if (slashSeparated) {
						if (startsWithYear) {
							// YYYY/MM/DD => YYYY-MM-DD
							birthDate = birthDate.replace(/\//g, '-')
						} else {
							// JJ/MM/YYYY => YYYY-MM-DD
							const [day, month, year] = birthDate.split('/')
							if (day && month && year) birthDate = `${year}-${month}-${day}`
						}
					} else {
						log('Format de date de naissance non reconnu:', birthDate)
					}
				}

				const email = params['patient_email'] || params['email'] || null

				/** @type {Partial<Patient>} */
				const data = { id: patientId, lastname, firstname, sex, birthDate, email }
				log(`Données patient extraites depuis le lien ${link.href}:`, data)

				result.id = result.id || data.id
				result.lastname = result.lastname || data.lastname
				result.firstname = result.firstname || data.firstname
				result.sex = result.sex || data.sex
				result.birthDate = result.birthDate || data.birthDate
				result.email = result.email || data.email
			} catch (error) {
				log(`Erreur lors de l'extraction depuis le lien ${link.href}:`, error)
			}
		}

		return result
	}

	/**
	 * @returns {string | null}
	 */
	function extractPatientId() {
		const patientIdRegex = /^[0-9]+$/

		const patientIdFromWindow = window.patientId || window.idpatient

		if (patientIdFromWindow) {
			const patientId = String(patientIdFromWindow).trim()

			if (patientIdRegex.test(patientId)) {
				log('ID patient trouvé dans window:', patientId)
				return patientId
			}
		}

		const patientIdFromInput =
			/** @type {HTMLInputElement | null} */ (document.querySelector('#patient_id'))?.value ||
			/** @type {HTMLInputElement | null} */ (document.querySelector('#patientId'))?.value

		if (patientIdFromInput) {
			const patientId = String(patientIdFromInput).trim()

			if (patientIdRegex.test(patientId)) {
				log('ID patient trouvé dans input:', patientId)
				return patientId.trim()
			}
		}

		log('ID patient non trouvé')

		return null
	}

	/**
	 * @returns {{ lastname: string; firstname: string } | null}
	 */
	function extractName() {
		// [PATIENT] M. DUPONT Jean - Dossier Administratif
		const titleStripped = document.title.replace('[PATIENT] ', '').trim()
		const nameFromTitle = parseName(titleStripped)
		if (nameFromTitle) {
			log('Nom patient trouvé dans le titre:', nameFromTitle)
			return nameFromTitle
		}

		const patientInfoNameElement = document.querySelector('.patientInfosName')
		if (patientInfoNameElement) {
			const text = patientInfoNameElement.textContent.trim()
			const nameFromText = parseName(text)
			if (nameFromText) {
				log('Nom patient trouvé dans le texte:', nameFromText)
				return nameFromText
			}
		}

		log('Nom patient non trouvé')

		return null
	}

	/**
	 * @param {string} text
	 * @returns {{ lastname: string; firstname: string } | null}
	 */
	function parseName(text) {
		// https://regex101.com/r/EcAbt0/2
		const lastnameRegex = /\b[A-Z ]+(?!\.)\b/
		// https://regex101.com/r/8Q5h0y/2
		const firstnameRegex = /[A-Z][a-zà-ú]*([\s\-][A-zÀ-ú]+)*/

		const lastname = text.match(lastnameRegex)?.[0]?.trim()

		if (lastname) {
			const rest = text.slice(text.indexOf(lastname) + lastname.length).trim()

			const firstname = rest.match(firstnameRegex)?.[0]?.trim()

			if (firstname) {
				return { lastname, firstname }
			}

			log('Prénom patient non trouvé dans:', text)
		} else {
			log('Nom de famille patient non trouvé dans:', text)
		}

		return null
	}

	/**
	 * @returns {string | null}
	 */
	function extractBirthDate() {
		const element = document.querySelector('.patientInfoData.dada01')
		if (!element) return null

		const dateMatch = element.textContent.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1]

		if (dateMatch) {
			log('Date de naissance trouvée:', dateMatch)
			const [day, month, year] = dateMatch.split('/')
			if (day && month && year) return `${year}-${month}-${day}`
		}

		log('Date de naissance non trouvée')

		return null
	}

	/**
	 * @returns {'M' | 'W' | null}
	 */
	function extractSex() {
		const sex = document.querySelector('.patientInfoData .mif-Homme')
			? 'M'
			: document.querySelector('.patientInfoData .mif-Femme')
				? 'W'
				: null

		if (sex) {
			log('Sexe trouvé:', sex)
		}

		return sex
	}

	/**
	 * @returns {string | null}
	 */
	function extractEmail() {
		const element = /** @type {HTMLInputElement | null} */ (document.querySelector('#patient_email'))

		if (element) {
			const email = element.value.trim()

			if (email) {
				log('Email trouvé depuis input:', email)
				return email
			}
		}

		log('Email non trouvé')

		return null
	}

	/**
	 * @param {string[]} selectors
	 * @returns {Promise<Element | null>}
	 */
	function waitForElement(selectors, timeout = 10000) {
		return new Promise((resolve) => {
			for (const selector of selectors) {
				const element = document.querySelector(selector)
				if (element) {
					log(`Élément trouvé immédiatement: ${selector}`)
					resolve(element)
					return
				}
			}

			const observer = new MutationObserver(() => {
				for (const selector of selectors) {
					const element = document.querySelector(selector)
					if (element) {
						log(`Élément trouvé via MutationObserver: ${selector}`)
						observer.disconnect()
						resolve(element)
						return
					}
				}
			})

			observer.observe(document.body, { childList: true, subtree: true })

			setTimeout(() => {
				observer.disconnect()
				log(`Timeout pour les sélecteurs:`, selectors)
				resolve(null)
			}, timeout)
		})
	}

	/**
	 * @param {any[]} message
	 */
	function log(...message) {
		if (window.AIDEN_DEBUG) console.log(`[Aiden]`, ...message)
	}
})()
