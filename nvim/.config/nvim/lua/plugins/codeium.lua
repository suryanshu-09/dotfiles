-- plugins/codeium.lua

return {
	{
		"Exafunction/windsurf.vim",
		event = "BufEnter",
		enabled = false,
	},
	{
		"zbirenbaum/copilot.lua",
		opts = {
			suggestion = { enabled = false },
			panel = { enabled = false },
			filetypes = {
				["*"] = false,
			},
		},
	},
}
