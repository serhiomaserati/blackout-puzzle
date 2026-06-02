import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // `@react-native-async-storage/async-storage` — опциональная RN-зависимость
    // MetaMask SDK, в вебе она не нужна. Заменяем её на пустой модуль, чтобы
    // убрать предупреждение "Module not found" при сборке.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
