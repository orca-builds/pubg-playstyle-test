import type { QuestionSet } from "@/types/test";

export const testVersion = "v1";

// 관리용 문항 순서입니다. 실제 출제 순서 섞기는 아직 적용하지 않습니다.
export const questionSet = {
  version: testVersion,
  questions: [
    {
      id: "q01",
      text: "우리 팀은 다음 자기장 밖에 있지만 이동할 시간은 충분하다. 인서클하는 길목 근처에서 두 팀이 교전 중이다.",
      choices: [
        {
          id: "q01-a",
          text: "시간이 충분하니 교전에 개입해 이득을 만든 뒤 인서클한다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q01-b",
          text: "교전에 시간을 쓰기보다 먼저 인서클해서 다음 플레이에 좋은 자리를 확보한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q02",
      text: "우리 팀은 자기장 안에서 괜찮은 자리를 확보하고 있다. 근처 적 한 명을 기절시켰지만 확킬각은 나오지 않고 상대 나머지 인원도 살아 있다.",
      choices: [
        {
          id: "q02-a",
          text: "상대가 구조하는 동안 추가 압박각을 만들어 교전을 이어간다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q02-b",
          text: "현재 자리 가치가 충분하다면 무리하게 교전을 이어가지 않고 포지션을 유지한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q03",
      text: "우리 팀은 다음 자기장으로 들어갈 시간과 이동 경로가 충분하다. 이동 중 옆 지역에서 적 한 팀의 위치를 먼저 발견했다.",
      choices: [
        {
          id: "q03-a",
          text: "먼저 발견한 이점을 활용할 수 있다면 이동 계획을 잠시 바꿔 교전을 본다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q03-b",
          text: "굳이 교전을 만들지 않고 원래 계획한 이동과 자리 확보를 우선한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q04",
      text: "우리 팀은 자기장 안에서 괜찮은 능선을 잡고 있다. 옆 능선에서 두 팀이 싸우다 한 팀이 크게 손해를 본 것이 확인됐다.",
      choices: [
        {
          id: "q04-a",
          text: "좋은 개입 타이밍이라면 현재 자리를 일부 포기하더라도 정리하러 간다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q04-b",
          text: "현재 능선의 가치가 충분하다면 싸움은 보내주고 자리를 유지한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q05",
      text: "우리 팀은 현재 인서클이고 다음 자기장까지 이동 거리도 짧다. 전투 준비도 된 상태에서 근처 적 팀의 위치를 먼저 발견했다.",
      choices: [
        {
          id: "q05-a",
          text: "먼저 발견한 이점을 활용해 교전 기회를 본다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q05-b",
          text: "굳이 교전을 만들기보다 다음 자기장 위치와 이후 운영을 먼저 본다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q06",
      text: "팀이 적이 있는 건물을 밀기로 했다. 평소 내 역할에 더 가까운 것은?",
      choices: [
        {
          id: "q06-a",
          text: "내가 1선으로 먼저 붙어 진입과 교전을 연다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q06-b",
          text: "1선 팀원 바로 뒤 2~3선에서 붙어 즉각적인 백업과 트레이드를 준비한다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q07",
      text: "우리 팀이 다음 엄폐로 공간을 넓혀야 하고 나와 팀원 모두 비슷한 위치에 있다.",
      choices: [
        {
          id: "q07-a",
          text: "내가 먼저 다음 엄폐로 이동해 팀이 들어올 공간을 연다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q07-b",
          text: "팀원이 먼저 이동하게 하고 나는 바로 뒤에서 즉시 백업할 수 있는 각을 잡는다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q08",
      text: "능선 너머 적의 정확한 위치를 모르고 누군가는 먼저 시야를 열어 정보를 만들어야 한다.",
      choices: [
        {
          id: "q08-a",
          text: "내가 먼저 앞각이나 새로운 시야를 확인해 적 위치를 찾는다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q08-b",
          text: "앞에서 정보를 보는 팀원이 노출될 때 바로 대응할 수 있도록 백업각을 잡는다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q09",
      text: "우리 팀이 앞쪽 적 팀과 대치하고 있다. 전면 교전을 열 수도 있지만 뒤쪽이나 반대 방향에서 다른 팀이 개입할 가능성도 있다.",
      choices: [
        {
          id: "q09-a",
          text: "앞에서 마주친 적과의 교전을 내가 먼저 열고 빠르게 정리하려 한다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q09-b",
          text: "앞 교전은 팀원들에게 맡기고 뒤나 반대 방향 시야를 확인해 제3팀 개입을 대비한다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q10",
      text: "팀이 새로운 지역으로 진입 중이고 앞쪽에 적이 있을 가능성이 있다.",
      choices: [
        {
          id: "q10-a",
          text: "내가 1선에서 정면 진행 방향과 앞 시야를 확인하며 이동을 연다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q10-b",
          text: "1선 팀원이 전진하는 동안 뒤와 양옆 시야를 확인하며 추가 적이나 측면 위협을 봐준다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q11",
      text: "적 한 명이 건물 안에 있고 위치는 대략 확인됐다. 팀원 한 명과 함께 해당 적을 정리하기로 했다.",
      choices: [
        {
          id: "q11-a",
          text: "팀원과 타이밍을 맞춰 빠르게 거리를 좁히고 직접 압박한다.",
          scoreDelta: { main: { pressure: 1 }, sub: { mainBody: 1 } },
        },
        {
          id: "q11-b",
          text: "팀원이 압박하는 동안 내가 돌아서 다른 각이나 퇴로를 잡는다.",
          scoreDelta: { main: { design: 1 }, sub: { flank: 1 } },
        },
      ],
    },
    {
      id: "q12",
      text: "적 한 명에게 큰 피해를 줬고, 그 적은 다른 팀원에게 즉시 백업받기 어려운 위치에 있다. 현재 위치에서는 바로 수류탄 각도 나오지 않는다.",
      choices: [
        {
          id: "q12-a",
          text: "연막이나 섬광으로 접근 공간을 만든 뒤 빠르게 거리를 좁혀 마무리한다.",
          scoreDelta: { main: { pressure: 1 } },
        },
        {
          id: "q12-b",
          text: "상대가 빠질 가능성이 높은 방향을 먼저 잡아 이동할 곳을 제한한 뒤 교전을 이어간다.",
          scoreDelta: { main: { design: 1 } },
        },
      ],
    },
    {
      id: "q13",
      text: "상대 팀과 우리 팀 모두 서로 위치를 알고 있고 교전을 이어가기로 했다.",
      choices: [
        {
          id: "q13-a",
          text: "팀원들과 같은 방향에서 타이밍을 맞춰 한쪽을 강하게 압박한다.",
          scoreDelta: { main: { pressure: 1 }, sub: { mainBody: 1 } },
        },
        {
          id: "q13-b",
          text: "본대가 압박하는 동안 내가 돌아서 새로운 각을 벌려준다.",
          scoreDelta: { main: { design: 1 }, sub: { flank: 1 } },
        },
      ],
    },
    {
      id: "q14",
      text: "복층 건물 2층에 적 두 명이 있고, 우리 팀의 투척으로 상대가 기존 위치를 유지하기 어려워진 상황이다.",
      choices: [
        {
          id: "q14-a",
          text: "상대가 밀려난 타이밍에 바로 붙어서 빠르게 진입 교전을 연다.",
          scoreDelta: { main: { pressure: 1 } },
        },
        {
          id: "q14-b",
          text: "내가 추가 투척을 활용해 상대가 창문이나 파쿠르로 빠져나오게 만들고 그 움직임을 잡는 편이다.",
          scoreDelta: { main: { design: 1 } },
        },
      ],
    },
    {
      id: "q15",
      text: "상대가 엄폐가 좋은 지역을 잡고 있고 우리 팀은 해당 팀과 싸우기로 했다. 차량에는 이동식 방패나 판처 같은 특수 장비도 있다.",
      choices: [
        {
          id: "q15-a",
          text: "연막이나 차량 등을 활용해 거리를 좁힌 뒤 빠르게 직접 교전을 만든다.",
          scoreDelta: { main: { pressure: 1 } },
        },
        {
          id: "q15-b",
          text: "시간이 허용된다면 특수 장비나 새로운 각을 활용해 상대가 편하게 싸우지 못하는 상황부터 만든다.",
          scoreDelta: { main: { design: 1 }, sub: { specialGear: 1 } },
        },
      ],
    },
    {
      id: "q16",
      text: "원래 가려던 가치 높은 파밍 지역에 다른 팀 한 팀도 내리는 게 보인다. 주변에 사용할 만한 대체 지역도 있다.",
      choices: [
        {
          id: "q16-a",
          text: "한 팀 정도 경쟁은 감수하고 원래 지역에 그대로 내린다.",
          scoreDelta: { main: { risk: 1 }, sub: { hotdrop: 1 } },
        },
        {
          id: "q16-b",
          text: "상대 꼬리를 보고 경쟁 없는 다른 지역으로 조정한다.",
          scoreDelta: { main: { safe: 1 }, sub: { tail: 1 } },
        },
      ],
    },
    {
      id: "q17",
      text: "다음 자기장 중앙 쪽에 가치 높은 건물이 비어 있는 것처럼 보인다. 들어가는 과정에는 노출 위험이 있고 외곽에는 안전하게 확보 가능한 자리도 있다.",
      choices: [
        {
          id: "q17-a",
          text: "성공했을 때 얻는 가치가 크다면 위험을 감수해 중앙 건물을 노린다.",
          scoreDelta: { main: { risk: 1 }, sub: { center: 1 } },
        },
        {
          id: "q17-b",
          text: "조금 덜 좋은 자리여도 확실하게 확보할 수 있는 외곽을 선택한다.",
          scoreDelta: { main: { safe: 1 }, sub: { edge: 1 } },
        },
      ],
    },
    {
      id: "q18",
      text: "적 한 명을 다운시켰지만 상대 나머지 인원의 위치가 모두 확인되지는 않았다. 우리 팀 상태는 좋다.",
      choices: [
        {
          id: "q18-a",
          text: "수적 우위가 사라지기 전에 어느 정도 위험을 감수하고 압박한다.",
          scoreDelta: { main: { risk: 1 } },
        },
        {
          id: "q18-b",
          text: "상대 나머지 위치를 조금 더 확인한 뒤 교전을 이어간다.",
          scoreDelta: { main: { safe: 1 } },
        },
      ],
    },
    {
      id: "q19",
      text: "다음 자기장의 가치 높은 건물을 우리 팀과 다른 팀이 비슷한 타이밍에 노리고 있다. 양쪽 모두 차량이 있고 도착 시점도 비슷해 보인다.",
      choices: [
        {
          id: "q19-a",
          text: "먼저 먹을 가능성이 있다면 충돌 가능성을 감수하고 그대로 들어간다.",
          scoreDelta: { main: { risk: 1 } },
        },
        {
          id: "q19-b",
          text: "점찍기 싸움 가능성이 높다면 다른 확보 가능한 자리를 선택한다.",
          scoreDelta: { main: { safe: 1 } },
        },
      ],
    },
    {
      id: "q20",
      text: "팀원 한 명이 다운됐고 빠르게 터치하지 않으면 살리기 어렵다. 하지만 상대 전원의 위치는 아직 확인되지 않았다.",
      choices: [
        {
          id: "q20-a",
          text: "연막을 빠르게 만들고 어느 정도 위험을 감수해서 구조를 시도한다.",
          scoreDelta: { main: { risk: 1 } },
        },
        {
          id: "q20-b",
          text: "추가 손실 위험이 크다고 판단하면 구조를 포기하고 남은 인원으로 운영한다.",
          scoreDelta: { main: { safe: 1 } },
        },
      ],
    },
    {
      id: "q21",
      text: "주무기 두 자루와 기본 방어구·회복은 갖췄지만 부착물, 투척물, 추가 회복은 부족하다. 지금 이동해도 운영에는 문제가 없다.",
      choices: [
        {
          id: "q21-a",
          text: "주변을 조금 더 파밍해서 장비 완성도를 높인 뒤 움직인다.",
          scoreDelta: { sub: { fullLoot: 1 } },
        },
        {
          id: "q21-b",
          text: "기본 전투가 가능하면 이동하고 부족한 물자는 이후에 채운다.",
          scoreDelta: { sub: { fastLoot: 1 } },
        },
      ],
    },
    {
      id: "q22",
      text: "차량에 추가 물자를 실을 수 있지만 공간에는 한계가 있다. 팀원들의 기본 전투 장비는 이미 갖춰진 상태다.",
      choices: [
        {
          id: "q22-a",
          text: "추가 탄약·회복·투척물을 넉넉하게 싣는다.",
          scoreDelta: { sub: { standardGear: 1 } },
        },
        {
          id: "q22-b",
          text: "일부 일반 물자를 줄이더라도 판처파우스트·박격포 같은 특수 장비를 싣는다.",
          scoreDelta: { sub: { specialGear: 1 } },
        },
      ],
    },
    // TODO: review q23 wording and scoring
    {
      id: "q23",
      text: "비행기에서 여러 팀의 낙하 위치를 확인했고, 두 후보 지역 모두 파밍은 충분하다.",
      choices: [
        {
          id: "q23-a",
          text: "다른 팀 동선보다 내가 익숙하고 운영하기 편한 지역을 우선해서 내린다.",
          scoreDelta: { sub: { hotdrop: 1 } },
        },
        {
          id: "q23-b",
          text: "상대 팀들의 낙하 위치를 보고 이후 동선까지 덜 겹칠 지역을 골라 내린다.",
          scoreDelta: { sub: { tail: 1 } },
        },
      ],
    },
    {
      id: "q24",
      text: "자기장 이동까지 시간은 있고 팀원들은 이동 준비를 마쳤다. 나는 전투는 가능하지만 원하는 탄 수량이나 회복·투척물이 조금 부족하다.",
      choices: [
        {
          id: "q24-a",
          text: "팀에게 잠깐 기다려달라고 하고 필요한 물자를 조금 더 맞춘다.",
          scoreDelta: { sub: { fullLoot: 1 } },
        },
        {
          id: "q24-b",
          text: "최소한의 전투 준비가 됐다면 팀 이동에 맞추고 이후에 보충한다.",
          scoreDelta: { sub: { fastLoot: 1 } },
        },
      ],
    },
  ],
} as const satisfies QuestionSet;
