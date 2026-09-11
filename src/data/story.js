// All story scripts of the game: the prologue, every NPC, the invisible
// triggers and the "after battle" hooks.  Dialogue text follows the original
// Flash game (魔塔 v1.12).  See engine/script.js for the step vocabulary.

import { T, DRAGON_PARTS, DRAGON_CORE, SHADOW_PARTS, SHADOW_CORE } from './tiles.js';
import { setTile } from '../engine/state.js';

const say = (who, text) => ({ t: 'say', who, text });
const hero = (text) => say('hero', text);
const msg = (text) => ({ t: 'msg', text });
const flag = (name, value = true) => ({ t: 'flag', name, value });
const item = (name, value = true) => ({ t: 'item', name, value });
const tile = (floor, x, y, id) => ({ t: 'tile', floor, x, y, tile: id });
const remove = (x, y) => ({ t: 'tile', x, y, tile: T.FLOOR });
const sfx = (name) => ({ t: 'sfx', name });

export const SPEAKERS = Object.freeze({
  hero: { name: '勇士', sprite: 'heroDown' },
  fairy: { name: '仙子', sprite: 'fairy' },
  thief: { name: '杰克', sprite: 'thief' },
  oldman: { name: '神秘老人', sprite: 'oldman' },
  merchant: { name: '商人', sprite: 'merchant' },
  princess: { name: '公主', sprite: 'princess' },
  redking: { name: '红衣魔王', sprite: 'm53' },
  boss: { name: '冥灵魔王', sprite: 'm59' },
  shop: { name: '神像', sprite: 'shop' },
  narr: { name: '', sprite: null },
});

// ---------------------------------------------------------------- prologue --
export function introScript() {
  return [
    hero('……'),
    say('fairy', '你醒了！'),
    hero('……\n你是谁？我在哪里？'),
    say('fairy', '我是这里的仙子，刚才你被这里的小怪打昏了。'),
    hero('……\n剑，剑，我的剑呢？'),
    say('fairy', '你的剑被他们抢走了，我只来得及将你救出来。'),
    hero('那，公主呢？我是来救公主的。'),
    say('fairy', '公主还在里面，你这样进去是打不过里面的小怪的。'),
    hero('那我怎么办？我答应了国王一定要把公主救出来的，我现在应该怎么办呢？'),
    say('fairy', '放心吧，我把我的力量借给你，你就可以打赢那些小怪了。不过，你得先去帮我找一样东西，找到了再来这里找我。'),
    hero('找东西？找什么东西？'),
    say('fairy', '是一个十字架，中间有一颗红色的宝石。'),
    hero('那个东西有什么用吗？'),
    say('fairy', '我本是这座塔的守护者，可不久前，从北方来了一批恶魔，他们占领了这座塔，并将我的魔力封在了这个十字架里面。如果你能将它带出塔来，那我的魔力便会慢慢地恢复，到那时我便可以把力量借给你去救公主了。'),
    say('fairy', '要记住，只有用我的魔力才可以打开二十一层的门。'),
    hero('……\n好吧，我试试看。'),
    say('fairy', '刚才我去看过了，你的剑被放在三楼，你的盾在五楼上，而那个十字架被放在七楼。要到七楼，你得先取回你的剑和盾。'),
    say('fairy', '另外在塔里的其他楼层上，还有一些存放了好几百年的宝剑和宝物，如果得到它们，对于你对付这里面的怪物将有很大的帮助。'),
    hero('……\n可是，我怎么进去呢？'),
    say('fairy', '我这里有三把钥匙，你先拿去。在塔里面还有很多这样的钥匙，你一定要珍惜使用。'),
    { t: 'hero', delta: { keys: { yellow: 1, blue: 1, red: 1 } } },
    sfx('item'),
    msg('得到黄、蓝、红钥匙各一把'),
    say('fairy', '勇敢地去吧，勇士！'),
    remove(5, 8),
    tile(0, 4, 8, T.FAIRY),
    flag('fairyIntro'),
  ];
}

// -------------------------------------------------------------------- NPCs --
function fairyScript(state, x, y) {
  if (!state.flags.fairyIntro) return introScript();
  if (state.floor === 22) return fairy22Script(state, x, y);
  return [
    {
      t: 'if',
      cond: (s) => s.items.cross && !s.flags.crossGiven,
      then: [
        hero('仙子，我已经将那个十字架找到了。'),
        say('fairy', '你做得很好。\n那么现在我就开始授予你更强的力量！\n咪啦哆咪哔……'),
        { t: 'hero', fn: (h) => ({ hp: Math.floor(h.hp * 4 / 3), atk: Math.floor(h.atk * 4 / 3), def: Math.floor(h.def * 4 / 3) }) },
        item('cross', false),
        flag('crossGiven'),
        tile(20, 5, 7, T.STAIR_UP),
        sfx('levelup'),
        { t: 'fx', name: 'levelup' },
        msg('生命、攻击、防御全部提升三分之一！二十层通往顶层的楼梯已经打开。'),
        say('fairy', '好了，我已经将你现在的能力提升了！\n记住：如果你没有足够的实力的话，不要去第二十一层！在那一层里，你所有宝物的法力都会失去作用！'),
      ],
      else: [
        {
          t: 'if',
          cond: (s) => s.items.iceStaff && !s.flags.staffExplained,
          then: [
            say('fairy', '嗯？！你手里的那个东西是什么？'),
            hero('这个？这是十六层的一个老人交给我的，是他叫我带它来找你的。他说你知道它的来历和作用。'),
            say('fairy', '这个东西是仙界的圣物，名叫“灵之杖”，是很久以前的一个圣者留下的。它们一共有三个，分别镶着红、绿、蓝三种颜色的宝石。'),
            say('fairy', '你现在拿着的是镶有蓝宝石的“冰之灵杖”，应该还有一个镶着绿宝石的“心之灵杖”和镶有红宝石的“炎之灵杖”。'),
            say('fairy', '在这座塔的下面，封印着一只魔界的世兽，名叫“血影”，这三把“灵之杖”就是封印的钥匙。'),
            hero('封印钥匙？'),
            say('fairy', '每一个“灵之杖”里面都有着很强的魔法力量，如果被恶魔得到了将会使它的力量倍增。如果被恶魔将它们三个找齐的话，那么“血影”的封印便会解除！'),
            say('fairy', '勇士，杀死顶层的魔王之后，带着三把灵之杖到第二十二层来找我，我就可以帮你将“灵之杖”中的魔力都开放出来！'),
            flag('staffExplained'),
          ],
          else: [
            {
              t: 'if',
              cond: (s) => !s.flags.crossGiven,
              then: [say('fairy', '十字架找到了吗？\n你的剑在三楼，盾在五楼，那个十字架被放在七楼。')],
              else: [say('fairy', '勇敢地去吧，勇士！\n记住：如果你没有足够的实力的话，不要去第二十一层！')],
            },
          ],
        },
      ],
    },
  ];
}

function sealAbyss(state) {
  let s = state;
  const cells = [[4, 1], [5, 1], [6, 1], [4, 2], [5, 2], [6, 2], [4, 3], [6, 3]];
  cells.forEach(([x, y], i) => { s = setTile(s, 26, x, y, SHADOW_PARTS[i]); });
  s = setTile(s, 26, 5, 3, SHADOW_CORE);
  return s;
}

function fairy22Script(state, x, y) {
  const hasAll = (s) => s.items.iceStaff && s.items.fireStaff && s.items.heartStaff;
  return [
    {
      t: 'if',
      cond: (s) => hasAll(s) && !s.flags.sealed,
      then: [
        hero('快看，我全部都找到了，我找齐三把灵之杖了！'),
        say('fairy', '嗯，不错，现在我们可以解除这里面的封印了！\n那就让我们开始吧！'),
        say('fairy', '神之灵杖呀，放射出你们的魔力吧！\n哈哩咪哆唏咪啦～～～'),
        hero('……（又来了）'),
        { t: 'fx', name: 'seal' },
        sfx('levelup'),
        say('fairy', '……好了，我已经将三把灵之杖的魔力都开放出来了！最底层的魔龙已被封印，现身的是它的宿主“血影”。'),
        say('fairy', '公主就由我来救出去，你快去最底层杀了那个大魔头吧！要记住，如果没有万分的把握，一定不要进入最后的传送门，一旦进去了，在杀死大魔头之前你将不能再回来！'),
        hero('好的，我明白了！'),
        { t: 'call', fn: sealAbyss },
        flag('sealed'),
        remove(x, y),
        msg('最底层的封印已经解开，去打败“血影”吧！'),
      ],
      else: [
        {
          t: 'if',
          cond: (s) => s.flags.sealed,
          then: [say('fairy', '去吧，勇士！最底层的传送门在第二十三层的中央。')],
          else: [
            say('fairy', '做得很好。现在你已经将那个可恶的冥灵魔王给消灭了，快去找齐三把“灵之杖”吧，找齐了之后再来找我！'),
            {
              t: 'if',
              cond: (s) => !s.items.iceStaff,
              then: [say('fairy', '冰之灵杖在第十六层的老人手里，炎之灵杖和心之灵杖分别在这一层左右两边的殿堂里。')],
              else: [say('fairy', '炎之灵杖和心之灵杖分别在这一层左右两边的殿堂里。要记住，如果我不把封印解开的话，最底层的怪物你是杀不了的！')],
            },
          ],
        },
      ],
    },
  ];
}

function thiefScript(state, x, y) {
  return [
    {
      t: 'if',
      cond: (s) => !s.flags.thiefFreed,
      then: [
        hero('你已经得救了！'),
        say('thief', '啊，那真是太好了，我又可以在这里面寻宝了！\n哦，还没有自我介绍，我叫杰克，是这附近有名的小偷，什么金银财宝我样样都偷过。'),
        say('thief', '不过这次运气可不是太好，刚进来就被抓了。\n现在你帮我打开了门，那我就帮你做一件事吧。'),
        hero('快走吧，外面还有很多怪物，我可能顾不上你。'),
        say('thief', '不，不，不会有事的。\n快说吧，叫我做什么？'),
        hero('……\n你会开门吗？'),
        say('thief', '那当然。'),
        hero('那就请你帮我打开第二层的门吧！'),
        say('thief', '那个简单。不过，如果你能帮我找到一把嵌了红宝石的铁榔头的话，我还帮你打通第十八层的路。'),
        hero('嵌了红宝石的铁榔头？好吧，我帮你找找。'),
        say('thief', '非常地感谢。一会我便会将第二层的门打开。如果你找到那个铁榔头的话，还是来这里找我！'),
        tile(2, 1, 6, T.FLOOR),
        flag('thiefFreed'),
        msg('杰克打开了第二层的铁门。'),
      ],
      else: [
        {
          t: 'if',
          cond: (s) => s.items.hammer && !s.flags.thiefHammer,
          then: [
            hero('哈，快看，我找到了什么！'),
            say('thief', '太好了，这个东西果然是在这里。\n好吧，我这就去帮你修好第十八层的路面。'),
            item('hammer', false),
            flag('thiefHammer'),
            tile(18, 5, 8, T.FLOOR),
            tile(18, 5, 9, T.FLOOR),
            remove(x, y),
            msg('杰克修好了第十八层的路面。'),
          ],
          else: [say('thief', '那把嵌了红宝石的铁榔头找到了吗？\n找到的话还是来这里找我！')],
        },
      ],
    },
  ];
}

const oldman2F = (x, y) => [
  hero('您已经得救了！'),
  say('oldman', '哦，我的孩子，真是太感谢你了！这个地方又脏又坏，我真的是快呆不下去了。'),
  hero('快走吧，我还得去救被关在这里的公主。'),
  say('oldman', '哦，你是来救公主的。为了表示对你的感谢，这个东西就送给你吧，这还是我年轻的时候用过的。\n拿着它去解救公主吧！'),
  { t: 'hero', delta: { atk: 70 } },
  sfx('item'),
  msg('得到老人的宝剑，攻击 +70'),
  remove(x, y),
];

const merchant2F = (x, y) => [
  hero('您已经得救了！'),
  say('merchant', '哦，是嘛！真是太感谢你了！\n我是个商人，不知为什么被抓到这里来了。'),
  hero('快走吧，现在你已经自由了。'),
  say('merchant', '哦，对对对，我已经自由了。\n那这个东西就给你吧，本来我是准备卖钱的。相信它对你一定很有帮助！'),
  { t: 'hero', delta: { def: 30 } },
  sfx('item'),
  msg('得到商人的盾牌，防御 +30'),
  remove(x, y),
];

const oldman15F = (x, y) => [
  say('oldman', '你好，勇敢的孩子，你终于来到这里了。\n我将给你一个非常好的宝物，它可以使你的攻击力提升 120 点，但这必须得用你的 500 点经验来进行交换。考虑一下吧！'),
  {
    t: 'choices',
    who: 'oldman',
    text: '用 500 点经验换取圣光剑（攻击 +120）？',
    options: [
      {
        label: '好吧，那就将那把剑给我吧！',
        steps: [
          {
            t: 'if',
            cond: (s) => s.hero.exp >= 500,
            then: [
              say('oldman', '那好吧，这把剑就给你了！'),
              { t: 'hero', delta: { exp: -500, atk: 120 } },
              sfx('item'),
              msg('得到圣光剑，攻击 +120'),
              remove(x, y),
            ],
            else: [hero('这……可我现在还没有那么多的经验。'), say('oldman', '那等你的经验够了而且想要的时候再来吧！')],
          },
        ],
      },
      { label: '我再考虑考虑。', steps: [say('oldman', '那等你想要的时候再来吧！')] },
    ],
  },
];

const merchant15F = (x, y) => [
  say('merchant', '啊哈，欢迎你的到来！\n我这里有一件对你来说非常好的宝物，只要你出得起钱，我就卖给你。'),
  hero('什么宝物？要多少钱？'),
  say('merchant', '是这个游戏里最好的盾牌，防御值可以增加 120 点，而你只要出 500 个金币就可以买下。\n怎么样？你有 500 个金币吗？'),
  {
    t: 'choices',
    who: 'merchant',
    text: '用 500 金币购买星光盾（防御 +120）？',
    options: [
      {
        label: '我有 500 个金币。',
        steps: [
          {
            t: 'if',
            cond: (s) => s.hero.gold >= 500,
            then: [
              say('merchant', '好，成交！'),
              { t: 'hero', delta: { gold: -500, def: 120 } },
              sfx('item'),
              msg('得到星光盾，防御 +120'),
              remove(x, y),
            ],
            else: [hero('……\n现在还没有。'), say('merchant', '那等你有了而且想要的时候再来找我吧！')],
          },
        ],
      },
      { label: '我再想想。', steps: [say('merchant', '那等你有了而且想要的时候再来找我吧！')] },
    ],
  },
];

const oldman16F = (x, y) => [
  say('oldman', '年轻人，你终于来了！'),
  hero('您怎么了？'),
  say('oldman', '我已经快封不住它了，请你将这个东西交给彩蝶仙子，她会告诉你这是什么东西，有什么用的！\n快去吧，再迟就来不及了！'),
  item('iceStaff'),
  sfx('item'),
  msg('得到【冰之灵杖】：镶有蓝宝石的灵之杖。'),
  remove(x, y),
];

const princess18F = () => [
  {
    t: 'if',
    cond: (s) => !s.flags.princessTalked,
    then: [
      hero('公主！你得救了！'),
      say('princess', '啊，你是来救我的吗？'),
      hero('是的，我是奉国王的命令来救你的。\n请你快随我出去吧！'),
      say('princess', '不，我还不想走。'),
      hero('为什么？这里到处都是恶魔。'),
      say('princess', '正是因为这里面到处都是恶魔，所以才不可以就这样出去，我要看着那个恶魔被杀死！\n英雄的勇士，如果你能够将那个大恶魔杀死，我就和你一起出去！'),
      hero('大恶魔？我已经杀死了一个魔王！'),
      say('princess', '大恶魔在这座塔的最顶层，你杀死的可能是一个小队长之类的恶魔。'),
      hero('好，那你等着，等我杀了那个恶魔再来这里找你！'),
      say('princess', '大恶魔比你刚才杀死的那个厉害多了。而且他还会变身，变身后的魔王他的攻击力和防御力都会提升至少一半以上，你得小心！\n请一定要杀死大魔王！'),
      flag('princessTalked'),
      tile(18, 10, 10, T.STAIR_UP),
      sfx('secret'),
      msg('通往十九层的楼梯出现了！'),
    ],
    else: [say('princess', '请一定要杀死大魔王！')],
  },
];

const shop = (id) => [{ t: 'shop', id }];

/** Script for talking to the NPC / shop on tile `tile` at (x,y) of the current floor. */
export function npcScript(state, tile, x, y) {
  const f = state.floor;
  const key = `${f}:${tile}`;
  switch (key) {
    case '0:24': case '22:24': return fairyScript(state, x, y);
    case '4:25': return thiefScript(state, x, y);
    case '2:26': return oldman2F(x, y);
    case '2:27': return merchant2F(x, y);
    case '3:22': return shop('gold3F');
    case '11:22': return shop('gold11F');
    case '5:26': return shop('exp5F');
    case '5:27': return shop('keys5F');
    case '12:27': return shop('keys12F');
    case '13:26': return shop('exp13F');
    case '15:26': return oldman15F(x, y);
    case '15:27': return merchant15F(x, y);
    case '16:26': return oldman16F(x, y);
    case '18:28': return princess18F();
    default:
      return [say('narr', '……')];
  }
}

// ---------------------------------------------------------------- triggers --
export function triggerScript(state, tile) {
  if (tile === T.TRIGGER_16F) {
    return [
      say('narr', '……'),
      say('redking', '停止吧！愚蠢的人类！'),
      hero('该停止的是你！魔王。快说，公主关在哪里？'),
      say('redking', '等你打赢我再说吧！'),
    ];
  }
  if (tile === T.TRIGGER_19F) {
    return [
      hero('大魔王，你的死期到了！'),
      say('boss', '哈哈哈……\n你也真是有意思，别以为蝶仙那家伙给了你力量你就可以打败我，想打败我你还早着呢！'),
      hero('废话少说，去死吧！'),
    ];
  }
  return [];
}

export function portalScript(state) {
  return [
    {
      t: 'choices',
      who: 'narr',
      text: state.flags.sealed
        ? '这是通往最底层的传送门。一旦进入，在杀死大魔头之前将无法回来。要进入吗？'
        : '这是通往最底层的传送门。仙子还没有解开封印，进去也无法战胜里面的魔物……仍要进入吗？',
      options: [
        { label: '进入', steps: [sfx('fly'), { t: 'goto', floor: 26, arrive: 'up' }] },
        { label: '再想想', steps: [] },
      ],
    },
  ];
}

// ------------------------------------------------------------ after battle --
export function afterBattleScript(state, monsterId, x, y) {
  const f = state.floor;
  if (f === 16 && monsterId === 53) {
    return [
      { t: 'tier', value: 1 },
      flag('boss16Killed'),
      say('redking', '可恶……公主……在十八层……'),
      msg('打败了红衣魔王！塔内高层的怪物似乎变得更强了……'),
    ];
  }
  if (f === 19 && monsterId === 59) {
    return [
      flag('boss19Killed'),
      say('boss', '看不出你还有两下子。你以为这样就赢了我？这充其量只是一个分身罢了！\n有本领的话来二十一楼，在那里，你就可以见识到我真正的实力了！'),
    ];
  }
  if (f === 21 && monsterId === T.VAMPIRE_2) {
    return [
      say('boss', '啊……\n怎么可能，我怎么可能会被你打败呢！\n不，不要这样……'),
      { t: 'tier', value: 2 },
      flag('boss21Killed'),
      tile(21, 4, 7, T.FLOOR),
      tile(21, 6, 7, T.FLOOR),
      tile(18, 5, 4, T.FLOOR),
      sfx('victory'),
      { t: 'end', ending: 'normal' },
    ];
  }
  if (f === 26 && (monsterId === SHADOW_CORE || monsterId === DRAGON_CORE)) {
    return [
      say('boss', '不！！！我怎么会被区区一个勇士消灭！！！'),
      { t: 'call', fn: (s) => {
        let st = s;
        const parts = monsterId === SHADOW_CORE ? SHADOW_PARTS : DRAGON_PARTS;
        for (let yy = 0; yy < 11; yy++) for (let xx = 0; xx < 11; xx++) {
          if (parts.includes(st.maps[26][yy][xx])) st = setTile(st, 26, xx, yy, T.FLOOR);
        }
        return st;
      } },
      flag('abyssCleared'),
      tile(26, 5, 10, T.STAIR_DOWN),
      msg('封印之地重归平静，回到隐藏层的楼梯出现了。'),
      sfx('victory'),
      { t: 'end', ending: 'true' },
    ];
  }
  return null;
}

// ------------------------------------------------------------ first arrive --
export function firstArriveScript(floor) {
  if (floor === 21) {
    return [msg('顶层充满了魔王的力量，风之罗盘在这里失去了作用！'), sfx('error')];
  }
  if (floor === 22) {
    return [msg('这里是塔的隐藏层……仙子在等着你。')];
  }
  if (floor === 26) {
    return [msg('最底层……传送门在身后消失了。')];
  }
  return null;
}
