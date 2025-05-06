return {
	-- add gruvbox
	{ "ellisonleao/gruvbox.nvim" },

	-- Configure LazyVim to load gruvbox
	{
		"LazyVim/LazyVim",
		opts = {
			colorscheme = "gruvbox",
		},
	},
}

-- return {
-- 	{ "catppuccin/nvim", name = "catppuccin", priority = 1000 },
-- 	{
-- 		"LazyVim/LazyVim",
-- 		opts = {
-- 			colorscheme = "catppuccin-macchiato",
-- 		},
-- 	},
-- }
