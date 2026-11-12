const sdk = require('@defillama/sdk');
const utils = require('../utils');

// wstDIEM is an ERC-4626 vault on Base that stakes DIEM with Venice. Each staked DIEM gives
// the vault $1 of Venice inference credit a day; the vault sells that credit for USDC, swaps
// the USDC to DIEM and credits it to the vault without minting shares. The yield is variable
// and paid in DIEM, so apyBase is the realized growth of the share price (convertToAssets of
// one share) over the past 7 days. It is net of the vault's 5% yield fee; there are no
// reward tokens or emissions.
const CHAIN = 'base';
const VAULT = '0xe49FA849cB37b0e7A42B2335e333fb99474167ba';
const DIEM = '0xF4d97F2da56e8c3098f3a8D538DB630A2606a024';

const DAY = 24 * 3600;
const WINDOW_DAYS = 7;
const ONE_SHARE = (10n ** 18n).toString();
const convertToAssets =
  'function convertToAssets(uint256) view returns (uint256)';

const apy = async () => {
  const now = Math.floor(Date.now() / 1e3);
  const [blockNow, blockPrior] = await utils.getBlocksByTime(
    [now, now - WINDOW_DAYS * DAY],
    CHAIN
  );
  const call = (abi, extra = {}) =>
    sdk.api.abi.call({ chain: CHAIN, target: VAULT, abi, ...extra });

  const [priceNow, pricePrior, totalAssets, { pricesByAddress }] =
    await Promise.all([
      call(convertToAssets, { params: [ONE_SHARE], block: blockNow }),
      call(convertToAssets, { params: [ONE_SHARE], block: blockPrior }),
      call('uint256:totalAssets'),
      utils.getPrices([DIEM], CHAIN),
    ]);

  const diemPrice = pricesByAddress[DIEM.toLowerCase()];
  if (!diemPrice) throw new Error('wstdiem: no DIEM price');
  const growth = Number(priceNow.output) / Number(pricePrior.output);

  return [
    {
      pool: `${VAULT}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'wstdiem',
      symbol: 'DIEM',
      token: VAULT,
      tvlUsd: (Number(totalAssets.output) / 1e18) * diemPrice,
      apyBase: (growth ** (365 / WINDOW_DAYS) - 1) * 100,
      pricePerShare: Number(priceNow.output) / 1e18,
      underlyingTokens: [DIEM],
      isIntrinsicSource: true,
      url: 'https://app.liquidprotocol.org/vault',
    },
  ];
};

module.exports = {
  protocolId: '9223',
  timetravel: false,
  apy,
  url: 'https://app.liquidprotocol.org/vault',
};
