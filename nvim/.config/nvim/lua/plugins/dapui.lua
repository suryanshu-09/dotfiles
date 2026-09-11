-- plugins/dapui.lua

return {
	{
		"mfussenegger/nvim-dap",
		dependencies = {
			"leoluz/nvim-dap-go",
		},
		config = function()
			local dap = require("dap")
			local dap_go = require("dap-go")

			dap_go.setup({
				delve = {
					args = { "--check-go-version=false" },
				},
			})

			dap.configurations.go = {
				{
					type = "go",
					name = "Debug Blind75",
					request = "launch",
					mode = "debug",
					program = "${fileDirname}",
				},
			}
		end,
	},
}
