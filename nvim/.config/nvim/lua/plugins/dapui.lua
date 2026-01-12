-- plugins/dapui.lua

return {
	{
		"mfussenegger/nvim-dap",
		dependencies = {
			"leoluz/nvim-dap-go",
		},
		config = function()
			local dap = require("dap")
			require("dap-go").setup({
				delve = {
					args = { "--check-go-version=false" },
				},
			})
		end,
	},
}
