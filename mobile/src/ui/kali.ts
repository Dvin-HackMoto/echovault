// EchoVault mobile — Kali the elephant (ASSETS/, copied to assets/kali/).

export const kali = {
  reading: require("../../assets/kali/reading.png"),
  hug: require("../../assets/kali/hug.png"),
  idea: require("../../assets/kali/idea.png"),
  photo: require("../../assets/kali/photo.png"),
  walk: require("../../assets/kali/walk.png"),
  peek: require("../../assets/kali/peek.png"),
  love: require("../../assets/kali/love.png"),
  wave: require("../../assets/kali/wave.png"),
  happy: require("../../assets/kali/happy.png"),
  sleep: require("../../assets/kali/sleep.png"),
  nap: require("../../assets/kali/nap.png"),
  cheer: require("../../assets/kali/cheer.png"),
} as const;

export type KaliPose = keyof typeof kali;
