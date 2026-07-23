module.exports = {
	apps: [
		{
			name: 'mikrotik-manager',
			cwd: '/opt/mikrotik-manager',
			script: 'build/index.js',
			interpreter: 'node',
			node_args: '--env-file=.env',
			env: { NODE_ENV: 'production' },
			instances: 1,
			exec_mode: 'fork',
			autorestart: true,
			max_memory_restart: '768M',
			restart_delay: 2000,
			kill_timeout: 10000,
			listen_timeout: 10000,
			merge_logs: true,
			time: true
		}
	]
};
