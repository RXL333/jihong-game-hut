export type PetKind = 'cat' | 'dog';
export const PETS = {
  cat: { name: '橘色狸花猫', nickname: '小橘', trait: '慢热一点点，爱你很多点', intro: '喜欢晒太阳，也喜欢悄悄靠近你。', color: '#dfab6b' },
  dog: { name: '焦糖棕腊肠狗', nickname: '可可', trait: '腿短短，想你的路长长', intro: '耳朵软软的，见到你就摇起尾巴。', color: '#ad7950' },
} as const;

export const ACTIONS = [
  { id: 'idle', name: '眨眨眼', page: 1, row: 0, level: 1, fps: 3, note: '安静陪在你身边，也是一件好事。' },
  { id: 'walk', name: '散散步', page: 1, row: 1, level: 1, fps: 8, note: '小小的脚步，在家里留下温柔。' },
  { id: 'sleep', name: '做个好梦', page: 1, row: 2, level: 1, fps: 2, note: '今天的梦里，一定也有你。' },
  { id: 'eat', name: '啊呜一口', page: 1, row: 3, level: 1, fps: 5, note: '谢谢你，我吃得好开心。' },
  { id: 'drink', name: '咕嘟咕嘟', page: 2, row: 0, level: 1, fps: 5, note: '喝一点水，继续元气满满。' },
  { id: 'tilt', name: '歪头看你', page: 2, row: 1, level: 2, fps: 4, note: '嗯？你是在叫我吗？' },
  { id: 'stretch', name: '伸个懒腰', page: 2, row: 2, level: 3, fps: 4, note: '伸一伸，把好心情也舒展开。' },
  { id: 'yawn', name: '小小哈欠', page: 2, row: 3, level: 4, fps: 4, note: '困意也可以很可爱。' },
  { id: 'wave', name: '爪爪招呼', page: 3, row: 0, level: 5, fps: 5, note: '嗨，我在这里等你呀。' },
  { id: 'hop', name: '开心小跳', page: 3, row: 1, level: 6, fps: 6, note: '开心得忍不住跳一下。' },
  { id: 'ball', name: '追追小球', page: 3, row: 2, level: 7, fps: 7, note: '再陪我玩一小会儿吧。' },
  { id: 'roll', name: '软软打滚', page: 3, row: 3, level: 8, fps: 5, note: '把今天的快乐，滚成一个圈。' },
  { id: 'belly', name: '肚皮给你', page: 4, row: 0, level: 9, fps: 4, note: '我很信任你，所以把柔软交给你。' },
  { id: 'nuzzle', name: '贴贴蹭蹭', page: 4, row: 1, level: 10, fps: 4, note: '靠近一点，再靠近一点。' },
  { id: 'spin', name: '转圈庆祝', page: 4, row: 2, level: 11, fps: 6, note: '和你在一起，普通的日子也值得庆祝。' },
  { id: 'hug', name: '抱紧玩具', page: 4, row: 3, level: 12, fps: 4, note: '喜欢的东西，要好好抱住。' },
  { id: 'peek', name: '探头找你', page: 5, row: 0, level: 13, fps: 4, note: '你躲在哪里？我看见你啦。' },
  { id: 'gift', name: '送你礼物', page: 5, row: 1, level: 14, fps: 4, note: '这是我找到的小美好，想送给你。' },
  { id: 'knead', name: '踏踏撒娇', page: 5, row: 2, level: 15, fps: 5, note: '放下小小防备，安心地撒个娇。' },
  { id: 'heart', name: '最喜欢你', page: 5, row: 3, level: 16, fps: 4, note: '你是我最最喜欢的人。' },
] as const;
export type ActionId = typeof ACTIONS[number]['id'];
export function actionName(id: string, kind: PetKind) {
  if (id === 'knead') return kind === 'cat' ? '幸福踩奶' : '踏踏撒娇';
  return ACTIONS.find(action => action.id === id)?.name ?? '眨眨眼';
}
