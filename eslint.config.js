const userscripts = require('eslint-plugin-userscripts')

module.exports = [
	{
		files: ['*.user.js'],
		plugins: {
			userscripts: {
				rules: userscripts.rules,
			},
		},
		rules: {
			...userscripts.configs.recommended.rules,
		},
		settings: {
			userscriptVersions: { tampermonkey: '*' },
		},
	},
]
