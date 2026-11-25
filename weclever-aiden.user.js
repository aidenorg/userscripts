// ==UserScript==
// @name         Passerelle WeClever Aiden
// @description  Relie WeClever à l'application bureau Aiden du poste : suivi des devis, ouverture du patient dans Aiden
// @author       Aiden
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/aidenorg/userscripts/develop/weclever-aiden.user.js
// @downloadURL  https://raw.githubusercontent.com/aidenorg/userscripts/develop/weclever-aiden.user.js
// @match        https://v2.app.weclever-dental.com/*
// @icon         https://app.aiden.care/favicon.ico
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

/// <reference path="./weclever-aiden.d.ts" />

;(() => {
	'use strict'

	// L'application bureau écoute sur ce port (desktop/src/main/softwares/weclever-relay.ts).
	const RELAY_URL = 'http://127.0.0.1:47816/weclever'

	// Application bureau fermée, ou poste sans application (Mac) : le script se tait et réessaie.
	const RETRY_MS = 60_000

	// Le relais rend la main au plus tard après 25 s d'attente longue.
	const RELAY_TIMEOUT_MS = 35_000

	const CONTACT_PATH = /^\/contact\/(\d+)/
	const ADDED_CLASS = 'aiden-open-patient'
	const BUTTON_TITLE = 'Ouvrir dans Aiden'

	let reachable = true

	loop()

	// WeClever redessine sa barre et change d'URL sans recharger la page.
	new MutationObserver(placeButtons).observe(document.body, { childList: true, subtree: true })
	placeButtons()

	/**
	 * Attend un appel de l'application bureau, l'exécute avec la session WeClever de la page,
	 * puis rend la réponse. Le script ne porte aucune logique : il prête la session.
	 */
	async function loop() {
		for (;;) {
			const doctorId = localStorage.getItem('docterId')
			if (!doctorId) {
				await wait(10_000)
				continue
			}

			/** @type {WecleverCall | null} */
			let call
			try {
				call = await relay('GET', '/next', doctorId)
				setReachable(true)
			} catch (error) {
				setReachable(false, error)
				await wait(RETRY_MS)
				continue
			}
			if (!call) continue

			const result = await run(call, doctorId)
			try {
				await relay('POST', '/result', doctorId, { id: call.id, ...result })
			} catch (error) {
				setReachable(false, error)
			}
		}
	}

	/**
	 * @param {WecleverCall} call
	 * @param {string} doctorId
	 * @returns {Promise<WecleverResult>}
	 */
	async function run(call, doctorId) {
		try {
			const response = await fetch(`/api${call.path}`, {
				method: call.method,
				credentials: 'include',
				headers: {
					...wecleverHeaders(doctorId),
					...(call.body !== undefined && { 'Content-Type': 'application/json' }),
				},
				body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
			})

			return {
				status: response.status,
				contentType: response.headers.get('content-type') || '',
				base64: toBase64(await response.arrayBuffer()),
			}
		} catch {
			return { status: 0, contentType: '', base64: '' }
		}
	}

	/**
	 * @param {string} doctorId
	 */
	function wecleverHeaders(doctorId) {
		// Le front de WeClever pose ces en-têtes sur chaque appel, sinon : YOU_NOT_HAVE_DOCTOR.
		return { 'X-Requested-With': 'XMLHttpRequest', 'X-Call-Header': 'dental', 'X-DoctorId': doctorId }
	}

	/**
	 * Une copie dans la barre large, une à côté du burger en étroit : WeClever cache déjà l'un ou l'autre.
	 */
	function placeButtons() {
		if (!CONTACT_PATH.test(location.pathname)) {
			for (const added of document.querySelectorAll(`.${ADDED_CLASS}`)) added.remove()
			return
		}

		// Le premier séparateur suit le bouton carte Vitale. À sa gauche, le groupe aligné à droite ne bouge pas.
		const vitale = document.querySelector(
			`#offcanvasNavbar hr.MuiDivider-vertical:not(.${ADDED_CLASS})`
		)?.previousElementSibling
		if (vitale && !vitale.previousElementSibling?.classList.contains(ADDED_CLASS)) {
			const divider = /** @type {Element} */ (vitale.nextElementSibling?.cloneNode())
			divider.classList.add(ADDED_CLASS)
			vitale.before(createButton(), divider)
		}

		const burger = document.querySelector('#mainHeader button[aria-label=Menu]')
		if (burger && !burger.previousElementSibling?.classList.contains(ADDED_CLASS)) {
			burger.before(createButton())
		}
	}

	function createButton() {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = ADDED_CLASS
		button.title = BUTTON_TITLE
		Object.assign(button.style, {
			width: '40px',
			height: '40px',
			padding: '0',
			border: 'none',
			borderRadius: '50%',
			background: 'url(https://app.aiden.care/favicon.ico) center / 24px no-repeat transparent',
			cursor: 'pointer',
			flexShrink: '0',
		})
		button.addEventListener('click', () => openInAiden(button))
		return button
	}

	/**
	 * Le DOM n'affiche ni email ni téléphone : la fiche vient de l'API, avec la session de la page.
	 * @param {HTMLButtonElement} button
	 */
	async function openInAiden(button) {
		const contactId = location.pathname.match(CONTACT_PATH)?.[1]
		const doctorId = localStorage.getItem('docterId')
		if (!contactId || !doctorId) return

		button.disabled = true
		button.style.opacity = '0.4'
		try {
			const response = await fetch(`/api/contact/find/${contactId}`, {
				credentials: 'include',
				headers: wecleverHeaders(doctorId),
			})
			if (!response.ok) throw new Error(`HTTP ${response.status}`)

			/** @type {WecleverContact} */
			const contact = await response.json()
			location.href = toDeeplink(contact)
			button.title = BUTTON_TITLE
		} catch (error) {
			console.info('[Aiden]', 'Fiche WeClever illisible.', error)
			button.title = "WeClever n'a pas rendu la fiche. Cliquer pour réessayer."
		} finally {
			button.disabled = false
			button.style.opacity = ''
		}
	}

	/**
	 * @param {WecleverContact} contact
	 */
	function toDeeplink(contact) {
		const phone = contact.phones?.find((entry) => entry.phoneTypeName === 'mobile') ?? contact.phones?.[0]

		const params = new URLSearchParams({
			id: String(contact.id),
			// Numéro de dossier repris par l'imagerie Vatech.
			imagingId: String(contact.vatech_chart_number || contact.nbr || ''),
			lastname: contact.lastname || '',
			firstname: contact.firstname || '',
			// Minuit UTC : la date se lit telle quelle.
			birth: contact.birthday?.slice(0, 10) || '',
			sex: contact.sex === 1 ? 'M' : contact.sex === 2 ? 'W' : '',
			email: contact.email || '',
			phone: phone?.nbr || '',
		})
		return `aiden://weclever/patient?${params}`
	}

	/**
	 * @param {'GET' | 'POST'} method
	 * @param {string} path
	 * @param {string} doctorId
	 * @param {unknown} [body]
	 * @returns {Promise<any>}
	 */
	function relay(method, path, doctorId, body) {
		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method,
				url: RELAY_URL + path,
				headers: {
					// Une page web ne peut pas poser cet en-tête sans pré-requête CORS, que le relais refuse.
					'X-Aiden-Weclever': '1',
					'X-Weclever-Doctor': doctorId,
					...(body !== undefined && { 'Content-Type': 'application/json' }),
				},
				data: body !== undefined ? JSON.stringify(body) : undefined,
				timeout: RELAY_TIMEOUT_MS,
				onload: (response) => {
					if (response.status === 200) resolve(JSON.parse(response.responseText))
					else if (response.status === 204) resolve(null)
					else reject(new Error(`Relais Aiden : HTTP ${response.status}`))
				},
				onerror: () => reject(new Error('Application bureau Aiden injoignable')),
				ontimeout: () => resolve(null),
			})
		})
	}

	/**
	 * @param {boolean} value
	 * @param {unknown} [error]
	 */
	function setReachable(value, error) {
		if (value === reachable) return
		reachable = value
		console.info(
			'[Aiden]',
			value ? 'Relié à l’application bureau Aiden.' : 'Application bureau Aiden injoignable.',
			error ?? ''
		)
	}

	/**
	 * @param {ArrayBuffer} buffer
	 */
	function toBase64(buffer) {
		const bytes = new Uint8Array(buffer)
		let binary = ''
		for (let start = 0; start < bytes.length; start += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
		}
		return btoa(binary)
	}

	/**
	 * @param {number} ms
	 */
	function wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
})()
