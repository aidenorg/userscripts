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

;(() => {
	'use strict'

	window.AIDEN_DEBUG = true

	let timerId = setTimeout(extractPatientInfo, 500)

	// Surveillance des changements de page (SPA)
	let lastUrl = window.location.href
	setInterval(() => {
		if (window.location.href !== lastUrl) {
			lastUrl = window.location.href
			clearTimeout(timerId)
			timerId = setTimeout(extractPatientInfo, 500)
		}
	}, 2000)

	/**
	 * @returns {Promise<PatientInfo>}
	 */
	async function extractPatientInfo() {
		log('Extraction des informations patient...')

		await waitForElement(['#vdTopBarPatientInfos'], 2000)

		const patientId = extractPatientId() || null
		const { lastname, firstname } = extractName() || { lastname: null, firstname: null }
		const birthDate = extractBirthDate()
		const sex = extractSex()
		const email = extractEmail()

		/** @type {PatientInfo} */
		const patientInfo = {
			id: patientId,
			lastname,
			firstname,
			birthDate,
			sex,
			email,
			url: window.location.href,
		}

		log('Informations patient extraites:', patientInfo)

		return patientInfo
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
