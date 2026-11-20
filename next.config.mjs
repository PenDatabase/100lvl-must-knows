export default {
  async headers() {
    return [
      {
        source: "/profile.webp",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};
