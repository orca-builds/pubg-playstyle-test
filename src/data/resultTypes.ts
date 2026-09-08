import type { ResultTypeCatalog } from "@/types/test";

// 메인축 네 개의 조합별 결과입니다. ID와 mainTraits는 같은 조합을 나타냅니다.
export const resultTypes = {
  "combat-frontline-pressure-risk": {
    id: "combat-frontline-pressure-risk",
    name: "화끈한 돌격대장",
    summary: "싸움이 보이면 직접 판을 열고 빠르게 승부를 보는 플레이어",
    imageSrc: null,
    imageAlt: "화끈한 돌격대장 캐릭터 이미지",
    description:
      "교전 기회가 보이면 먼저 판을 열고 팀에서도 앞라인을 맡는 걸 좋아합니다.\n" +
      "빠르게 거리를 좁혀 상대에게 생각할 시간을 주지 않고, 이득이 보이면 위험도 과감하게 감수하는 스타일입니다.",
    mainTraits: {
      combatPosition: "combat",
      frontlineSupport: "frontline",
      pressureDesign: "pressure",
      riskSafe: "risk",
    },
  },
  "combat-frontline-pressure-safe": {
    id: "combat-frontline-pressure-safe",
    name: "확실한 진입대장",
    summary: "이길 타이밍을 기다렸다가 직접 들어가 확실하게 끝내는 플레이어",
    imageSrc: null,
    imageAlt: "확실한 진입대장 캐릭터 이미지",
    description:
      "싸움을 피하기보다는 직접 해결하는 걸 좋아하지만, 무작정 들어가기보다는 이길 수 있는 타이밍을 봅니다.\n" +
      "기회가 확실해지는 순간 앞에서 빠르게 진입해 교전을 끝내는 타입입니다.",
    mainTraits: {
      combatPosition: "combat",
      frontlineSupport: "frontline",
      pressureDesign: "pressure",
      riskSafe: "safe",
    },
  },
  "combat-frontline-design-risk": {
    id: "combat-frontline-design-risk",
    name: "변수 창출대장",
    summary: "과감한 움직임과 새로운 각으로 교전의 변수를 만드는 플레이어",
    imageSrc: null,
    imageAlt: "변수 창출대장 캐릭터 이미지",
    description:
      "교전을 적극적으로 만들면서도 단순히 정면에서 부딪히는 것만 고집하지 않습니다.\n" +
      "위험을 감수해서라도 새로운 각이나 움직임을 만들며 상대가 예상하지 못한 전투를 여는 스타일입니다.",
    mainTraits: {
      combatPosition: "combat",
      frontlineSupport: "frontline",
      pressureDesign: "design",
      riskSafe: "risk",
    },
  },
  "combat-frontline-design-safe": {
    id: "combat-frontline-design-safe",
    name: "계산된 전투대장",
    summary: "싸우기 전에 유리한 구조를 만들고 직접 전투를 여는 플레이어",
    imageSrc: null,
    imageAlt: "계산된 전투대장 캐릭터 이미지",
    description:
      "싸움을 좋아하지만 들어가기 전에 먼저 이길 수 있는 구조를 만들려고 합니다.\n" +
      "각과 위치, 상대 움직임을 계산한 뒤 직접 앞장서서 교전을 시작하는 스타일입니다.",
    mainTraits: {
      combatPosition: "combat",
      frontlineSupport: "frontline",
      pressureDesign: "design",
      riskSafe: "safe",
    },
  },
  "combat-support-pressure-risk": {
    id: "combat-support-pressure-risk",
    name: "돌격 트레이더",
    summary: "팀원의 진입에 빠르게 붙어 화력과 트레이드로 싸움을 이어가는 플레이어",
    imageSrc: null,
    imageAlt: "돌격 트레이더 캐릭터 이미지",
    description:
      "팀원이 교전을 열면 빠르게 따라붙어 화력을 보태는 데 익숙합니다.\n" +
      "직접 첫 진입을 고집하기보다 팀원과 함께 싸움의 템포를 높이고 과감하게 트레이드를 보는 스타일입니다.",
    mainTraits: {
      combatPosition: "combat",
      frontlineSupport: "support",
      pressureDesign: "pressure",
      riskSafe: "risk",
    },
  },
  "combat-support-pressure-safe": {
    id: "combat-support-pressure-safe",
    name: "확실한 마무리꾼",
    summary: "열린 교전에서 안정적인 타이밍을 잡아 확실하게 끝내는 플레이어",
    imageSrc: null,
    imageAlt: "확실한 마무리꾼 캐릭터 이미지",
    description:
      "먼저 무리해서 싸움을 열기보다 열린 교전을 놓치지 않고 확실하게 끝내는 걸 선호합니다.\n" +
      "팀원의 움직임에 빠르게 맞추면서도 안정적인 타이밍에 직접 압박을 더하는 스타일입니다.",
    mainTraits: {
      combatPosition: "combat",
      frontlineSupport: "support",
      pressureDesign: "pressure",
      riskSafe: "safe",
    },
  },
  "combat-support-design-risk": {
    id: "combat-support-design-risk",
    name: "측면 교란자",
    summary: "본대와 다른 각을 만들어 상대의 시선을 흔드는 플레이어",
    imageSrc: null,
    imageAlt: "측면 교란자 캐릭터 이미지",
    description:
      "팀이 교전하는 동안 같은 방향에만 머물기보다 새로운 각을 만들며 상대 시선을 분산시키는 걸 좋아합니다.\n" +
      "필요하다면 과감하게 거리를 벌려 팀이 싸우기 편한 변수를 만드는 스타일입니다.",
    mainTraits: {
      combatPosition: "combat",
      frontlineSupport: "support",
      pressureDesign: "design",
      riskSafe: "risk",
    },
  },
  "combat-support-design-safe": {
    id: "combat-support-design-safe",
    name: "전투 조율사",
    summary: "팀이 편하게 싸울 수 있도록 각과 백업을 정리하는 플레이어",
    imageSrc: null,
    imageAlt: "전투 조율사 캐릭터 이미지",
    description:
      "직접 눈에 띄는 첫 진입보다 팀 전체가 싸우기 편한 구조를 만드는 데 관심을 둡니다.\n" +
      "안정적인 각과 백업, 상대 움직임을 보면서 교전이 꼬이지 않도록 정리하는 스타일입니다.",
    mainTraits: {
      combatPosition: "combat",
      frontlineSupport: "support",
      pressureDesign: "design",
      riskSafe: "safe",
    },
  },
  "position-frontline-pressure-risk": {
    id: "position-frontline-pressure-risk",
    name: "돌파형 자리개척자",
    summary: "좋은 자리를 위해 위험도 감수하며 직접 공간을 여는 플레이어",
    imageSrc: null,
    imageAlt: "돌파형 자리개척자 캐릭터 이미지",
    description:
      "좋은 위치가 필요하다면 싸움을 감수해서라도 직접 길을 뚫는 편입니다.\n" +
      "팀의 다음 공간을 만들기 위해 앞에서 압박하고 위험한 자리 경쟁에도 적극적으로 참여하는 스타일입니다.",
    mainTraits: {
      combatPosition: "position",
      frontlineSupport: "frontline",
      pressureDesign: "pressure",
      riskSafe: "risk",
    },
  },
  "position-frontline-pressure-safe": {
    id: "position-frontline-pressure-safe",
    name: "안정형 선점대장",
    summary: "좋은 자리를 먼저 보고 안전하게 팀의 이동 공간을 만드는 플레이어",
    imageSrc: null,
    imageAlt: "안정형 선점대장 캐릭터 이미지",
    description:
      "좋은 위치와 다음 운영을 먼저 생각하지만 필요한 순간에는 직접 앞장섭니다.\n" +
      "무리한 싸움보다는 확실하게 확보할 수 있는 공간을 골라 팀의 이동을 여는 스타일입니다.",
    mainTraits: {
      combatPosition: "position",
      frontlineSupport: "frontline",
      pressureDesign: "pressure",
      riskSafe: "safe",
    },
  },
  "position-frontline-design-risk": {
    id: "position-frontline-design-risk",
    name: "과감한 길잡이",
    summary: "필요하다면 위험을 감수해 새로운 이동 경로를 여는 플레이어",
    imageSrc: null,
    imageAlt: "과감한 길잡이 캐릭터 이미지",
    description:
      "교전 자체보다 팀이 앞으로 사용할 공간과 이동 경로를 중요하게 생각합니다.\n" +
      "안전한 길만 기다리기보다 필요하면 위험을 감수해 새로운 루트와 선택지를 먼저 만드는 스타일입니다.",
    mainTraits: {
      combatPosition: "position",
      frontlineSupport: "frontline",
      pressureDesign: "design",
      riskSafe: "risk",
    },
  },
  "position-frontline-design-safe": {
    id: "position-frontline-design-safe",
    name: "스마트 리더",
    summary: "다음 위치와 이동을 계산하고 직접 앞에서 길을 확인하는 플레이어",
    imageSrc: null,
    imageAlt: "스마트 리더 캐릭터 이미지",
    description:
      "다음 위치와 이동 흐름을 계산해 팀이 어디로 가야 할지 먼저 판단하는 편입니다.\n" +
      "안정적인 계획을 세우면서도 뒤에서 지켜보기보다 직접 앞에서 길을 확인하고 팀을 이끄는 스타일입니다.",
    mainTraits: {
      combatPosition: "position",
      frontlineSupport: "frontline",
      pressureDesign: "design",
      riskSafe: "safe",
    },
  },
  "position-support-pressure-risk": {
    id: "position-support-pressure-risk",
    name: "위기 대응대장",
    summary: "팀이 위험해지는 순간 직접 뛰어들어 상황을 해결하는 플레이어",
    imageSrc: null,
    imageAlt: "위기 대응대장 캐릭터 이미지",
    description:
      "평소에는 자리와 팀의 생존을 중시하지만, 팀이 위험해지면 직접 뛰어들어 상황을 해결하려는 편입니다.\n" +
      "필요한 순간에는 위험도 감수하면서 빠르게 화력을 보태는 스타일입니다.",
    mainTraits: {
      combatPosition: "position",
      frontlineSupport: "support",
      pressureDesign: "pressure",
      riskSafe: "risk",
    },
  },
  "position-support-pressure-safe": {
    id: "position-support-pressure-safe",
    name: "스쿼드 수호자",
    summary: "팀의 손실을 줄이고 안정적으로 움직이게 만드는 플레이어",
    imageSrc: null,
    imageAlt: "스쿼드 수호자 캐릭터 이미지",
    description:
      "팀이 안정적으로 움직이고 좋은 위치를 유지하는 것을 중요하게 생각합니다.\n" +
      "먼저 무리해서 싸움을 만들기보다 문제가 생겼을 때 확실하게 백업하고 팀의 손실을 줄이는 스타일입니다.",
    mainTraits: {
      combatPosition: "position",
      frontlineSupport: "support",
      pressureDesign: "pressure",
      riskSafe: "safe",
    },
  },
  "position-support-design-risk": {
    id: "position-support-design-risk",
    name: "변수 운영가",
    summary: "운영을 기본으로 하되 필요하면 예상 밖의 선택으로 판을 바꾸는 플레이어",
    imageSrc: null,
    imageAlt: "변수 운영가 캐릭터 이미지",
    description:
      "기본적으로 위치와 운영을 중요하게 생각하지만 정석적인 선택만 고집하지 않습니다.\n" +
      "상황을 뒤집을 가치가 있다면 과감한 이동이나 새로운 각을 활용해 예상 밖의 선택지를 만드는 스타일입니다.",
    mainTraits: {
      combatPosition: "position",
      frontlineSupport: "support",
      pressureDesign: "design",
      riskSafe: "risk",
    },
  },
  "position-support-design-safe": {
    id: "position-support-design-safe",
    name: "스쿼드 참모총장",
    summary: "정보와 위치를 보며 팀 전체의 흐름을 안정적으로 관리하는 플레이어",
    imageSrc: null,
    imageAlt: "스쿼드 참모총장 캐릭터 이미지",
    description:
      "좋은 위치, 정보, 팀원 상태를 함께 보며 전체 흐름을 안정적으로 관리하려 합니다.\n" +
      "직접 판을 흔들기보다는 팀원들이 편하게 싸울 수 있는 상황을 차근차근 만드는 스타일입니다.",
    mainTraits: {
      combatPosition: "position",
      frontlineSupport: "support",
      pressureDesign: "design",
      riskSafe: "safe",
    },
  },
} as const satisfies ResultTypeCatalog;
