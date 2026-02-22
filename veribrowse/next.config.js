/** @type {import('next').NextConfig} */
module.exports = {
    output: 'export',
    distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
    trailingSlash: true,
    images: {
        unoptimized: true,
    },
    webpack: (config) => {
        config.externals = [...(config.externals || []), { electron: 'commonjs electron' }];
        return config;
    },
};
