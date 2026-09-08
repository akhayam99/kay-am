import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Database } from '../client';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrate } from './runner';
import { migrations } from './index';

const MIGRATION_FILE = /^m(\d{3})-[a-z0-9-]+\.ts$/;

const versions = migrations.map((migration) => migration.version);

const fileVersions = (): ReadonlyArray<number> =>
  readdirSync(join(import.meta.dirname))
    .map((name) => MIGRATION_FILE.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);

const SAMPLED_INTERMEDIATE_VERSIONS = 12;

type SampleIntermediateCountsParams = {
  readonly total: number;
  readonly sampleSize: number;
};

const sampleIntermediateCounts = ({
  total,
  sampleSize,
}: SampleIntermediateCountsParams): ReadonlyArray<number> => {
  const highest = total - 1;
  if (highest < 1) {
    return [];
  }
  const step = Math.max(1, Math.ceil(highest / sampleSize));
  const offset = 1 + (total % step);
  const sampled = new Set<number>([1, highest]);
  for (let count = offset; count <= highest; count += step) {
    sampled.add(count);
  }
  const ordered = [...sampled].sort((a, b) => a - b);
  if (ordered.length <= sampleSize + 1) {
    return ordered;
  }
  const withoutHighest = ordered.filter((count) => count !== highest);
  return [...withoutHighest.slice(0, sampleSize), highest];
};

const schemaOf = async (db: Database): Promise<ReadonlyArray<string>> => {
  const rows = await db.select<{ readonly sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
  );
  return rows
    .map((row) => (row.sql ?? '').replace(/\s+/g, ' ').trim())
    .sort((a, b) => a.localeCompare(b));
};

const SHIPPED_MIGRATION_SQL_SHA256: Readonly<Record<number, string>> = {
  1: 'b97d6ff342d2f9287015ff20d3c4b1fb6b0a1c2f08008912c3ca884dc503f2d2',
  2: '72113f777b7e174446048c326ad1b6df15723b759996a92b1b4a92aa2775a21e',
  3: 'dd1f8a67d535cdbc8033a4c1a3168a3991a9cd7fcaf713fba51510fd073ebc0a',
  4: '3329cc5fc5e781d62d623750b006580f5e3ba76c9487883196fcc441e9c9de41',
  5: 'abd7b84a4120771a494eed5e1fc74e96533f32f6adad572e292aca242e708db6',
  6: '200d42382c788cd346125f94183a296f035a3f2964ace81884438742d7514cc0',
  7: '57c0806eab4846aacd775df76610bb60989a2c718b102e1aeba20544a3d24039',
  8: 'd70f5ab4348f8538920d4f46c6bf24076b38017fba63b314a7cd4b5152e8f809',
  9: '4b879ab59d1243e49265f2c518524ea139557e4d7e8af8360f418718d90686f2',
  10: '0f85495a685663ef59a87f4e30782c90cd10a275560adfc2544e2782ee74d4a4',
  11: '99e50f05d995300c34dd02f8a6ada7db4c2d3ce9aa0f261e5cf70b6fba40937d',
  12: 'bf99bee5c278cb0314e334f93c709683b9d3aa477f3d1af9f65e9e1174bc1ffe',
  13: '1709f64f344e06cbbd7b29caa70bc18c5e8ff69245fe381dd3175525131c1f19',
  14: '6b307937051c2bf51ee239ebb5df37baee21b72c435deadbd15c0e2f83ea5bbd',
  15: '8ab179b0e50a8604200f47432faa09a74ac9433a21be271da47817ebd0d9724e',
  16: '56a4827f894ec9374ebe2ec7c120635c68e5277445505fe56e4e8aa7ea2efd06',
  17: 'a98cbf762a84c1e89f53dd6b164799611c718315ce1b32bafd5066ca4bd185e6',
  18: '6fe6f740f02080db977dd4b6694da87ba9de383ffcd0f3e883a681d1c44d3cad',
  19: '56dc35c406088c26f45c6432319b29094987fbc0ad4597c16f97592f7ab49345',
  20: 'fcaec8142a7972c012329e361df9e782ccea832709e4a9dd07828452e09e8ec9',
  21: 'c7300c6710c08ee057df532925d9e099ba3e83e96eba64769d81ae673d00dc58',
  22: 'c920f1980b571f07fc17fb5db294194704b3626eb14ab8fdacfe5fe854928f6b',
  23: '2325baac2b7a763d57b70787804bf6a7790b626da246dcdcc75ca5322b3b7806',
  24: 'baef5b3f09c39ef3abb1b344e91fc5c3e47a2390c44e23ccfb5ff7f22ee171a0',
  25: 'f0ec87d2b7af989eac02cd257fec4d2504026f6748a728e8fe81f793cc12f889',
  26: 'f7c5e607906005345015afaaea73db59a4f4e13d5a4bb9e6a24848a386ffd64f',
  27: 'a1785f430070e64b2b74e4a6d4def05da3b1b1208b8c5d677a00f3847d8a8b04',
  28: '4c0f078a359638b6c9c75609bd3ab66ccf10f5f1e7c7ae06f33c58faec52ea69',
  29: 'c04be6cb1fd607fba57b51c30a8df31cdc4962887468981e7a7c2184f27d16aa',
  30: '587f59cc9c0b89948725d358ef54a2098769d82de57a6e1f9e12b97767230e5b',
  31: '05c0845b8cb713da0ce213ab8976b412ae7ca9829ff0a86669d1c50e898b10fe',
  32: '985de15731c6dbd5d5d91b7e3f8a04bec903125951e887ca30ce64c50086f55f',
  33: '4cd3f3ef108f3134153838a9eb6cd58738becff8e36498f2fcab69354d0153a3',
  34: '0640f8a93ef2787c7769d8ae0e3ad2cb894de2932b7e311aa26b1ed697aef169',
  35: '5355860bbe6fdd2f6891521b02253f8ec53ecc780627bde5498bad192c7ad861',
  36: '33c0c6e3087c7d6d9661f9f0282c217beeb525a1f97aa638563364ed63d32298',
  37: '3f0400e73e278ee5b3b74c64f943cec376f7b21b71a9f85c2a3575c6ab0c45c4',
  38: 'fe61a8c12be223499d87b9a74ce570425e2f0b0642dccb96de4bf3741159caf5',
  39: '74ee82b338f5a7699eae643f1526c5031482ea43d55eb44383fd5c35857f841d',
  40: '3d5a8370aa6a4a4a8fbb463138d282f7de641ba31ec551670d5be98085f0d6c5',
  41: '43a2a55e8ed755b94193770ed80cb5f744910c07de4f9bff8807c4cd11d77e8d',
  42: '2184b73ea2690098bab63e6ee2e6f108b28a0f68325d17f7f03c53f9323f192f',
  43: 'fbdf3e66e0576f2c1d32a907d5ac015321a059a54ed25d5e7cedc7b722fb2206',
  44: 'c58f16154ae8c52e022b646a3c0b31eb32ddce1cd0af742ef3376ef91e9a6adc',
  45: 'c185035214e6b1456c7fa28d189d114efdffefcccf87a5b563a4b2f6401ed105',
  46: '6b282bf18df9f21f0f5ce23a4ff6104cfb596c7162a7821959cd0dca984d4e44',
  47: 'fddc0a2ad79670b85d5209fceb7dbb2ff13d15265f183a113edb714e8555bcf8',
  48: 'c180ee93c4c45cd0610a3c52cced59851660baab395444696ce19b43e1fac5ea',
  49: 'ef0deb4f40cfade0404c51a53934a2a07e75a2b2c017da0a410cf7aaa5a97606',
  50: '00608c3c12cab832001cbe023e99ab1a5b958521ef870cd4eed3b3030ab8c157',
  51: 'bb88addbbae07a70b1727e14f69c04b98bf9ab8ea4a965f497fe0d6002238ffd',
  52: 'c73aed3c96e3a6fcfa6fdf7eeb585bcdcf7c78e026fb46e4c10df9dafd01ccd4',
  53: '5ead1f1eaa2b0f1e305e85d77b4a511604d9358b92a7f8ac2bf9122603a7ba42',
  54: 'd0a22c92ddaeeced2a1894376acd7dd46d1a27e7f57481f84c319eb2e43ed10e',
  55: '0351722ed0a837370b4a9013ccca364937e3c2070133a5012c680914e155bdf5',
  56: 'b83b1a91edd7093cea1dd59f648aa5500b225c3b2dca13049353c3c8c35c984b',
  57: '3111ed3ebec96cddae17f2448adbffaf733a8e3d2a6a42de6c9fc9eb2611f1cd',
  58: '8a89ce345374761c31ec20be9593c91fc0e1f8a9fd559d884a5ec8e28ce02ee8',
  59: '5f60060b0e31add6332091f45fc9ba45a7674f960b874ee4238e363faa22a605',
  60: '44972dec9c75b019584f68be609075056dceca76fe6685f15779a52d1955e78f',
  61: 'e6c7164b99ef6b8f00757b3df124ea8ca6ad3a280e592d06c0c07b1f0091ea58',
  62: '0083702b6161fa26c67a6e35e2fe43bf1e3d36a44b14cc472edb63602720d641',
  63: '2458288ffaa2dc5402b800446c5137edcc698d5aa914d77a828b82b6b724a312',
  64: '781cc9c9356a37e88f930bab44164f7b267219372966a43cc834233c052f1a78',
  65: 'feff78083b083c86d319ac01c8fff7fba0ddbb38837b9d6ef7e9ea5089145c16',
  66: '7821d094dae843905a1db518d528d508ac8cf5530a7c17d947152a42db21c50d',
  67: '690635434edd0377fdc2cfb57ca4b23a461bae78bde48177547d06805ba9891f',
  68: '72847095c9417ef29eb299c75ef3b8c4425258b84890a279c892ebb6ebd9748b',
  69: 'aab3d5a107218207527b611676b5ed94ea7bee4b1800061c8db455d6bf8f97a4',
  70: 'efa138a81627e793b100015b793d61b99e39eff01a37a7e277f689d03c208e2f',
  71: '2ce5ac1b32f9750fc8a44faae32bb871777229ccffbff9d2d40e6d793a54fa1b',
  72: '41b7e5c8d00f0c3cc1a9ff0612fb5f28d7847c9cdb22b5d826628118a9714441',
  73: '91e126b62aff6f9943e60cc059fd8838715f458760efc0310a097dac04d91e2f',
  74: 'af0e17e7dcb13960d428a3a4bddd071fb1c18dfac258dbb93e8cf56589c99b38',
  75: '8f99cba82d2155a0863a79ffff2b616a4686e016fdbf522ed3d8229932d4da50',
  76: 'c2076e2b275442d74998e084a9cc72b71c5b8ca2bd65de7a2f1b3483ecf4f880',
  77: '2a7d2708bb80d8a136bd4e04c3abee35cf068731d684517d6228850ee1332e42',
  78: '36b4edbd30fa2530c507967c4f1a2088ef7d5b8906a40f1b11229518ab3b1f99',
  79: '0f12ce1618f7fa196a135a2a206eb6e45f3ce7975a8988ed6f8d1f618035b3ad',
  80: '69c2b25ec1ba68b19b9bf633130fafdffd35bc8c1bcecad6038b5cb41c4520e3',
  81: '09a60f5ba7dbb5520bd6769b24f047a8b2d409e1f3c7ef7118149a88cd86b792',
  82: 'de552e0b2f78b67ad261493f845e594a9325c82949d09575ab347d364a54b524',
  83: '3f49cbe247ca5b5b3460729a194293e2a318166c217d85409e3815cca7dd6f4a',
  84: '2b1f96a4e612de8101c365170ffe03e697c719270dd50532c8d912c178aa7f80',
  85: '256302435bbf3df4399630480ad3ed7c537997da5643d4f31be7d1732951235b',
  86: 'f6e963cb715387e9118f79e72eafff359d227956dc40364bcf9e729795378b32',
  87: '3e0421d84e16f8d4ec46cf95468ce8a136e8aafc9e551c4dcda8ae742d31f4a8',
  88: '8150bf958102dc1e25cd433c45bc67b227a05a6a7c893f23eb55fbf6cc0614a7',
  89: '9c31ebcb749e2849b34171a41e202b09fdde61f4ac888f712d26d1017eedb222',
  90: 'c2f5970933976b61203f834ccbe9038e906212b6f0862262a9f6cbb2d608c8e5',
  91: '5319d7a91772734e42ee8371bd2ffb079d806ed834895fbd2ba8f5cf4a979e3a',
  92: '14199cab677a94cd018c9205b375590f5f185eec47c2cbd34c0fd93e65db8ea4',
  93: 'd27651f3ce29dd1c562a8e645ae32b58814d306ab14451942993d21a807f9a4a',
  94: '5d45394d639f9b9ca07e3839c0404495de01c8832eebb9cae27da687e5924516',
  95: '3d8f1c65bb6d9cd315e1b1f40cd927912e8ad91c40448819cb06cbd80f03aef4',
  96: '764a96d7c1a9759de21da5290209dabddbd350958596b3d2cc9098e1e98d5b91',
  97: '3b497a034003da6f9962728cb0dde02a7e4d308256f29152c66854758f14ba4e',
  98: 'b39d674261dae53cdfa1cdd50ac323910c49c8201e186ee2c1954f5e4f8a3856',
  99: '020f354937828d233a0c223490455a3c2b57eb685d7896b30e0e04600490abc9',
  100: 'fa8fc0a389a22532cc1e68cd861cb121956cd9bbb62e2abd647ab496ea27d7b1',
  101: '1c69088d2ad17725ed6207bbd7b5c8a95ef75d47ae0ef28f872b4dfcdad87cbc',
  102: '340560ce07a609ddc8735ae9f1b0dd24b5d556ffef9818a5cf22c4066a6c6955',
  103: '8f40c6674a9ed5f9f7244d68e5c08ba5c3a0e681a093916de36e65f7bf7156e4',
  104: '58e331b4884a6d9574c4d27e0dc6f203f22e791763b71e2b138f64df584b81c9',
  105: '960f3ee8bc40a70c1314ad6966389ad9ee5661199ce3e9a299a3c8241c7ba94d',
  106: '53dc69b33b361028d09fd1c8700da3f70844e3cf399c93f9b3f333e71f1674bb',
  107: '8ade6c99fa4a1ed80b069a8021835f7bc2013519216fb26d7ced468cd93d8c11',
  108: '8f1dd54cac660cd990cc5957fb539640519f5ae39a2c344d1c30411e11de6437',
  109: 'cf0dd049b97412b010176840cdd159965e4f0188c7ad49acf26703e5660d81a1',
  110: '1ed3a391843edc5423e22a0fa7d054b9d965fc95187e5eee13027a8dff7ab22d',
  111: '3046e49cc0182365392cdfae06f6718a19ab7ecba5178b8db06ff331eba4f299',
  112: 'cc1186af0a7c27ce9b600b5f1298a955375906e9449444561bc3ce0bee05d56e',
  113: 'e4dc13e5d968d92f39d35c37260c0ace1c1939a8a0942fd53347e448602e50f6',
  114: '86327dd8477a5794fb649f7d1f8942968d3b79bc460b18a06488f2d1cbd8338f',
  115: '90bfd30d51404a38c56b621fc469b391b8681cee11af5e0d1d215da9fcc1e953',
  116: '6a646ecfa328bd0da37ad9efe6f7b89c8cd948dd408c745e87437ebf1f864da5',
  117: 'f0e73d09d334350250486de1af1f3a3dc4881db65c89228e275997a1c7c12d3a',
  118: 'c5c3eb1e5c946cf72d1f8b50074ba7e6922bce1ed515f0b01d43e5a2fc313a71',
  119: '7b83931a874181712d6b1df29ce0f39b6655f4e859a0473c42666debf593dce5',
  120: '2d6b79811adaf0e97c6d3797aa430f49031d3b0679e1fdc6a44d3f645a3a0c19',
  121: 'd96321d54ed0fa1e644f35a97381268785b85618c9a357c164dfac8429bb2c09',
  122: '69fca7d61d59f9842c23978761adc923b907fd48fa5fa5b3d9a37537cc742871',
  123: '9d11f84c0d1dcc352c226997006c3ac69b27cdf2cb08ef8ef5dd0a7f98140c7b',
  124: 'c78a36f3d919f9ca472e1a9f93288cb669d742943fb1ba687d4d3ccb51b87627',
  125: '9e08a8666c20e7b41cb7a44b407e1de13946fa06b3bae70711a6a7806379f727',
  126: 'a2f12b88bbf1dcebf1cf0a57a02dbe26b0f09e940399e605514042231498c366',
  127: 'f0e8f2634dccf8cbb135c1c28821e9b8a0a11007d6208dc6f5c59e48f8bc37eb',
  128: 'fd398e0897445a5cb070d8ad6c089b9c32e9fa82bb856df6d9bf620512b1d2da',
  129: '3a9e93fedf88f8b40f2ee1513a401a1c2b718ca1b55d1107003b3c709ae3ef05',
  130: '66629d1980fc6805a7eff27156135d9152727379ccd47ba03c432ea69aa55291',
  131: '392e9d2788178db4807b5a99d10e692ade6db4fda231ab7f77daf3a94028332f',
  132: 'af62afc7388a7d776371404c5048601e1da3f8008d222e2847ebe78499705cbe',
  133: '0d86d7a5ff20749453c04fc330de5f30014f382feaa9df5e2c436e12c2dd1975',
  134: '7f9c9b1aa884f3e0abfd22f3a75e06bb37349c98c39fb2f0d30be78fe88f98f0',
  135: 'f337c27a2f514af9d277072b9fef776c720d2c96adb007ae28ebbdab1d7c1f8f',
  136: '295cf8b5c2189362d76f2d9948de47fab01cdcf7e754ce22b08988bedefab614',
  137: 'f3d8963095f84f8025cc563d3869a25be2f6a2ca479f723ea47245a2a8a87c4a',
  138: '31b8777bf614bfafc36e0794a531fefd9191b5ce427688b4dd10e705f7d4d97a',
  139: '8ab1ee16d5a6afa3aec01f76cbb4e62d9d833739bfc0b7c60334ea5ac3c23a45',
  140: '9d1aa33334ee1181de5f2f1649ba4860239cce4ea328da767e8ef610a389d20c',
  141: 'c5cf82071ed07486ccaeb675e48d098a0a410eba54889672e34409060738d371',
  142: 'e231be33dbfd7a62be57bca00f8d147c2eb6ac272cf42296e3e040dae18bea28',
  143: 'f23fea6c982a2f690cf9ec68f2d13e38c32415453d771b5d051a42bccc0984d3',
  144: '70719b2a90dd8ae002b4031560b16c341f0b5553b4eb1777d21a1d031541d996',
  145: '95103318acc474ed8616174383efeed309f22d8b581228c5de0c8df103c4d10f',
  146: '7519b771efbaf3898837a59e5c8cebb07b8fbfb09a0d3b8f0a1ae205d93859b4',
  147: '24fe29fbcbd201dd096fe228d969870faa09140b57280a0f77a84ac69c68c768',
  148: '623a73c7b676a8c41f19be815820c695a10198b52318a9c5500d71553f1bb7f2',
};

const MIN_CONVERGENCE_SAMPLE_POINTS = 10;
const manifestVersions = Object.keys(SHIPPED_MIGRATION_SQL_SHA256)
  .map(Number)
  .sort((a, b) => a - b);
const manifestHead = manifestVersions[manifestVersions.length - 1] ?? 0;
const sqlSha256 = ({ sql }: { readonly sql: string }): string =>
  createHash('sha256').update(sql).digest('hex');

describe('migration registry', () => {
  it('registers every version exactly once', () => {
    const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);
    expect(duplicates).toEqual([]);
  });

  it('registers a contiguous range starting at 1', () => {
    const sorted = [...versions].sort((a, b) => a - b);
    expect(sorted).toEqual(sorted.map((_, index) => index + 1));
  });

  it('is declared in ascending order', () => {
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
  });

  it('registers every migration file at the version in its filename', () => {
    expect([...versions].sort((a, b) => a - b)).toEqual(fileVersions());
  });

  it('carries distinct sql per version', () => {
    const statements = migrations.map((migration) => migration.sql);
    expect(new Set(statements).size).toBe(statements.length);
  });

  it('keeps every manifest version byte-identical to its shipped sql', () => {
    for (const version of manifestVersions) {
      const migration = migrations.find((candidate) => candidate.version === version);
      expect(
        migration,
        `manifest pins version ${version} but the registry no longer has it`,
      ).toBeDefined();
      expect(
        sqlSha256({ sql: migration?.sql ?? '' }),
        `shipped migration ${version} changed; migration bodies are immutable after release, add a new migration instead`,
      ).toBe(SHIPPED_MIGRATION_SQL_SHA256[version]);
    }
  });

  it('pins every registered migration, new ones only above the manifest head', () => {
    const unpinned = migrations.filter(
      (migration) => SHIPPED_MIGRATION_SQL_SHA256[migration.version] === undefined,
    );
    for (const migration of unpinned) {
      expect(
        migration.version,
        `migration ${migration.version} is missing from SHIPPED_MIGRATION_SQL_SHA256 and sits at or below the manifest head ${manifestHead}; a shipped version may not be renumbered or reinserted`,
      ).toBeGreaterThan(manifestHead);
    }
    const lines = unpinned
      .map((migration) => `  ${migration.version}: '${sqlSha256({ sql: migration.sql })}',`)
      .join('\n');
    expect(
      unpinned.length,
      `new migration(s) not yet pinned; paste into SHIPPED_MIGRATION_SQL_SHA256:\n${lines}`,
    ).toBe(0);
  });
});

describe('migration convergence', () => {
  it('applies every version once on a fresh database', async () => {
    const db = makeTestDatabase();
    const result = await migrate(db);
    expect(result.applied).toEqual([...versions].sort((a, b) => a - b));
    expect(result.skipped).toEqual([]);
  });

  it('applies nothing on a database already at the latest version', async () => {
    const db = makeTestDatabase();
    await migrate(db);
    const result = await migrate(db);
    expect(result.applied).toEqual([]);
  });

  it('samples the oldest and the newest intermediate version', () => {
    const counts = sampleIntermediateCounts({
      total: migrations.length,
      sampleSize: SAMPLED_INTERMEDIATE_VERSIONS,
    });
    expect(counts.at(0)).toBe(1);
    expect(counts.at(-1)).toBe(migrations.length - 1);
    expect(counts.length).toBeLessThanOrEqual(SAMPLED_INTERMEDIATE_VERSIONS + 1);
  });

  it('reaches the fresh-install schema from sampled intermediate versions', async () => {
    const fresh = makeTestDatabase();
    await migrate(fresh);
    const target = await schemaOf(fresh);

    const counts = sampleIntermediateCounts({
      total: migrations.length,
      sampleSize: SAMPLED_INTERMEDIATE_VERSIONS,
    });
    for (const count of counts) {
      const upgraded = makeTestDatabase();
      await migrate(upgraded, migrations.slice(0, count));
      const result = await migrate(upgraded);
      expect(result.applied).toEqual(versions.slice(count));
      expect(await schemaOf(upgraded)).toEqual(target);
    }
  }, 30_000);

  it('samples at least the floor of intermediate versions, strictly increasing', () => {
    const counts = sampleIntermediateCounts({
      total: migrations.length,
      sampleSize: SAMPLED_INTERMEDIATE_VERSIONS,
    });
    const isStrictlyIncreasing = counts.every(
      (count, index) => index === 0 || count > (counts[index - 1] ?? 0),
    );
    expect(counts.length).toBeGreaterThanOrEqual(MIN_CONVERGENCE_SAMPLE_POINTS);
    expect(isStrictlyIncreasing).toBe(true);
    expect(counts).toContain(1);
    expect(counts).toContain(migrations.length - 1);
  });
});
