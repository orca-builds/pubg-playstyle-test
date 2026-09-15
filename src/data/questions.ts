import type { QuestionSet } from "@/types/test";

export const testVersion = "v2";

// 관리용 문항 순서입니다. 실제 출제 순서 섞기는 아직 적용하지 않습니다.
export const questionSet = {
  version: testVersion,
  questions: [
    {
      id: "q01",
      text: "우리 팀은 다음 자기장 밖에 있지만 이동할 시간은 충분하다.\n인서클하는 길목 근처에서 두 팀이 교전 중이다.",
      choices: [
        {
          id: "q01-choice-1",
          text: "시간이 충분하니 교전에 개입해 이득을 만든 뒤 인서클한다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q01-choice-2",
          text: "교전에 시간을 쓰기보다 먼저 인서클해서 다음 플레이에 좋은 자리를 확보한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q02",
      text: "우리 팀은 자기장 안에서 괜찮은 자리를 확보하고 있다.\n근처 적 한 명을 기절시켰지만 확킬각은 나오지 않고\n상대 나머지 인원도 살아 있다.",
      choices: [
        {
          id: "q02-choice-1",
          text: "상대가 구조하는 동안 추가 압박각을 만들어 교전을 이어간다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q02-choice-2",
          text: "현재 자리 가치가 충분하다면 무리하게 교전을 이어가지 않고 포지션을 유지한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q03",
      text: "우리 팀은 다음 자기장 안쪽의 좋은 자리를 확보할 수 있는 상황이다.\n이동 중 멀지 않은 곳에서 적 팀 한 명이 뒤처져 있는 것을 발견했다.",
      choices: [
        {
          id: "q03-choice-1",
          text: "뒤처진 적을 잡을 기회라고 보고 잠시 경로를 바꿔 압박한다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q03-choice-2",
          text: "한 명을 노리기보다 예정된 좋은 자리 확보를 우선한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q04",
      text: "우리 팀은 자기장 안에서 괜찮은 능선을 잡고 있다.\n옆 능선에서 두 팀이 싸우다 한 팀이 크게 손해를 본 것이 확인됐다.",
      choices: [
        {
          id: "q04-choice-1",
          text: "좋은 개입 타이밍이라면 현재 자리를 일부 포기하더라도 정리하러 간다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q04-choice-2",
          text: "현재 능선의 가치가 충분하다면 싸움은 보내주고 자리를 유지한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q05",
      text: "상대 팀과 잠시 교전했지만 서로 큰 피해는 없다.\n다음 자기장이 공개됐고,\n우리 팀이 지금 이동하면 좋은 자리를 먼저 확보할 가능성이 높다.",
      choices: [
        {
          id: "q05-choice-1",
          text: "상대 팀과의 교전을 계속 이어가 이득을 만들어본다.",
          scoreDelta: { main: { combat: 1 } },
        },
        {
          id: "q05-choice-2",
          text: "교전을 끊고 먼저 다음 자기장으로 이동해 유리한 자리를 확보한다.",
          scoreDelta: { main: { position: 1 } },
        },
      ],
    },
    {
      id: "q06",
      text: "팀이 적이 있는 건물을 밀기로 했다.\n평소 내 역할에 더 가까운 것은?",
      choices: [
        {
          id: "q06-choice-1",
          text: "내가 1선으로 먼저 붙어 진입과 교전을 연다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q06-choice-2",
          text: "1선 팀원 바로 뒤 2~3선에서 붙어 즉각적인 백업과 트레이드를 준비한다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q07",
      text: "우리 팀이 다음 엄폐로 공간을 넓혀야 하고\n나와 팀원 모두 비슷한 위치에 있다.",
      choices: [
        {
          id: "q07-choice-1",
          text: "내가 먼저 다음 엄폐로 이동해 팀이 들어올 공간을 연다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q07-choice-2",
          text: "팀원이 먼저 이동하게 하고\n나는 바로 뒤에서 즉시 백업할 수 있는 각을 잡는다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q08",
      text: "능선 너머 적의 정확한 위치를 모르고\n누군가는 먼저 시야를 열어 정보를 만들어야 한다.",
      choices: [
        {
          id: "q08-choice-1",
          text: "내가 먼저 앞각이나 새로운 시야를 확인해 적 위치를 찾는다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q08-choice-2",
          text: "뒤에서 넓은 시야를 잡고,\n앞에서 움직이는 팀원이 체크하는 동안\n주변 적과 다른 각을 계속 봐준다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q09",
      text: "우리 팀이 앞쪽 적 팀과 대치하고 있다.\n전면 교전을 열 수도 있지만\n뒤쪽이나 반대 방향에서 다른 팀이 개입할 가능성도 있다.",
      choices: [
        {
          id: "q09-choice-1",
          text: "제3팀이 개입하기 전에 앞 팀을 빠르게 정리할 수 있다고 보고,\n내가 먼저 전면 교전을 연다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q09-choice-2",
          text: "앞 교전은 팀원들에게 맡기고\n뒤나 반대 방향 시야를 확인해 제3팀 개입에 대비한다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q10",
      text: "우리 팀이 현재 자리를 쓰다가\n다음 운영을 위해 적 팀이 있는 능선이나 엄폐 지역을 차량으로 밀어야 한다.\n여러 대의 차량으로 함께 진입할 수 있는 상황이다.",
      choices: [
        {
          id: "q10-choice-1",
          text: "내가 1선 차량으로 먼저 들어가\n상대 위치와 반응을 확인하고 시선을 받으면서,\n뒤 차량들이 들어올 공간을 만든다.",
          scoreDelta: { main: { frontline: 1 } },
        },
        {
          id: "q10-choice-2",
          text: "1선 차량보다 한 템포 뒤의 2~3선으로 따라가며,\n앞 차량에서 교전이 열리면\n바로 트레이드하거나 백업할 수 있게 움직인다.",
          scoreDelta: { main: { support: 1 } },
        },
      ],
    },
    {
      id: "q11",
      text: "적 한 명이 건물 안에 있고 위치는 대략 확인됐다.\n팀원 한 명과 함께 해당 적을 정리하기로 했다.",
      choices: [
        {
          id: "q11-choice-1",
          text: "팀원과 타이밍을 맞춰 빠르게 거리를 좁히고 직접 압박한다.",
          scoreDelta: { main: { pressure: 1 }, sub: { mainBody: 1 } },
        },
        {
          id: "q11-choice-2",
          text: "팀원이 압박하는 동안 내가 돌아서 다른 각이나 퇴로를 잡는다.",
          scoreDelta: { main: { design: 1 }, sub: { flank: 1 } },
        },
      ],
    },
    {
      id: "q12",
      text: "적 한 명에게 큰 피해를 줬고,\n그 적은 다른 팀원에게 즉시 백업받기 어려운 위치에 있다.\n현재 위치에서는 바로 수류탄 각도 나오지 않는다.",
      choices: [
        {
          id: "q12-choice-1",
          text: "연막이나 섬광으로 접근 공간을 만든 뒤\n빠르게 거리를 좁혀 마무리한다.",
          scoreDelta: { main: { pressure: 1 } },
        },
        {
          id: "q12-choice-2",
          text: "상대가 빠질 가능성이 높은 방향을 먼저 잡아\n이동할 곳을 제한한 뒤 교전을 이어간다.",
          scoreDelta: { main: { design: 1 } },
        },
      ],
    },
    {
      id: "q13",
      text: "상대 팀 한 명의 위치를 먼저 확인했고,\n상대는 아직 우리 위치를 정확히 모르는 상황이다.\n다른 적들의 위치는 아직 모두 확인되지 않았다.",
      choices: [
        {
          id: "q13-choice-1",
          text: "상대가 대응하기 전에 기절시킬 수 있는 각이 나오면\n먼저 한 명을 잡고 바로 압박을 이어간다.",
          scoreDelta: { main: { pressure: 1 }, sub: { mainBody: 1 } },
        },
        {
          id: "q13-choice-2",
          text: "바로 쏘기보다 각을 벌리면서\n상대 인원과 위치를 더 확인한 뒤 교전을 시작한다.",
          scoreDelta: { main: { design: 1 }, sub: { flank: 1 } },
        },
      ],
    },
    {
      id: "q14",
      text: "상대 팀의 위치가 어느 정도 확인됐고,\n운영상 이 팀과 교전해야 하는 상황이다.\n우리 팀도 바로 교전을 시작할 준비가 되어 있다.",
      choices: [
        {
          id: "q14-choice-1",
          text: "팀원들과 한쪽에 힘을 실어\n빠르게 거리를 좁히고 정면에서 교전을 시작한다.",
          scoreDelta: { main: { pressure: 1 }, sub: { standardGear: 1 } },
        },
        {
          id: "q14-choice-2",
          text: "바로 들어가기보다 먼저 기절 기회를 보거나\n박격포·투척 등 상황에 맞는 견제 수단을 활용해\n유리한 교전각을 만든 뒤 싸움을 시작한다.",
          scoreDelta: { main: { design: 1 }, sub: { specialGear: 1 } },
        },
      ],
    },
    {
      id: "q15",
      text: "상대 팀이 넓게 퍼져 있고\n서로 백업이 가능한 야외 지형이다.",
      choices: [
        {
          id: "q15-choice-1",
          text: "상대 한쪽을 빠르게 찍어서\n화력을 몰아 먼저 한 명을 무너뜨린다.",
          scoreDelta: { main: { pressure: 1 } },
        },
        {
          id: "q15-choice-2",
          text: "바로 한쪽으로 몰리지 않고\n팀원끼리 각을 나눠 잡아\n상대가 여러 방향을 신경 쓰게 만든 뒤 교전을 시작한다.",
          scoreDelta: { main: { design: 1 } },
        },
      ],
    },
    {
      id: "q16",
      text: "원래 가려던 가치 높은 파밍 지역에\n다른 팀 한 팀도 내리는 게 보인다.\n주변에 사용할 만한 대체 지역도 있다.",
      choices: [
        {
          id: "q16-choice-1",
          text: "한 팀 정도 경쟁은 감수하고 원래 지역에 그대로 내린다.",
          scoreDelta: { main: { risk: 1 }, sub: { hotdrop: 1 } },
        },
        {
          id: "q16-choice-2",
          text: "상대 꼬리를 보고 경쟁 없는 다른 지역으로 조정한다.",
          scoreDelta: { main: { safe: 1 }, sub: { tail: 1 } },
        },
      ],
    },
    {
      id: "q17",
      text: "다음 자기장 중앙 쪽에 가치 높은 건물이 비어 있는 것처럼 보인다.\n들어가는 과정에는 노출 위험이 있고\n외곽에는 안전하게 확보 가능한 자리도 있다.",
      choices: [
        {
          id: "q17-choice-1",
          text: "성공했을 때 얻는 가치가 크다면\n위험을 감수해 중앙 건물을 노린다.",
          scoreDelta: { main: { risk: 1 }, sub: { center: 1 } },
        },
        {
          id: "q17-choice-2",
          text: "조금 덜 좋은 자리여도\n확실하게 확보할 수 있는 외곽을 선택한다.",
          scoreDelta: { main: { safe: 1 }, sub: { edge: 1 } },
        },
      ],
    },
    {
      id: "q18",
      text: "다음 지역으로 이동해야 한다.\n빠른 직선 루트는 적에게 노출될 가능성이 있지만,\n성공하면 다른 팀보다 먼저 도착해 좋은 자리나 이동 주도권을 잡을 수 있다.\n조금 돌아가는 루트는 비교적 안전하지만 도착이 늦어질 수 있다.\n시간상 두 경로 모두 선택 가능하다.",
      choices: [
        {
          id: "q18-choice-1",
          text: "노출 위험을 감수하고 빠른 직선 루트로 이동해\n먼저 좋은 자리와 주도권을 노린다.",
          scoreDelta: { main: { risk: 1 } },
        },
        {
          id: "q18-choice-2",
          text: "도착이 조금 늦더라도\n비교적 안전한 우회 루트로 이동한다.",
          scoreDelta: { main: { safe: 1 } },
        },
      ],
    },
    {
      id: "q19",
      text: "다음 자기장의 가치 높은 중앙 건물을\n우리 팀과 다른 팀이 비슷한 타이밍에 노리고 있다.\n양쪽 모두 차량이 있고 도착 시점도 비슷해 보인다.\n외곽에는 비교적 안정적으로 확보 가능한 대체 자리도 있다.",
      choices: [
        {
          id: "q19-choice-1",
          text: "먼저 먹을 가능성이 있다면\n충돌 가능성을 감수하고 중앙의 좋은 자리를 그대로 노린다.",
          scoreDelta: { main: { risk: 1 }, sub: { center: 1 } },
        },
        {
          id: "q19-choice-2",
          text: "자리 경쟁 가능성이 높다면\n외곽의 비교적 안정적인 대체 자리를 선택한다.",
          scoreDelta: { main: { safe: 1 }, sub: { edge: 1 } },
        },
      ],
    },
    {
      id: "q20",
      text: "팀원 한 명이 다운됐고\n빠르게 터치하지 않으면 살리기 어렵다.\n하지만 상대 전원의 위치는 아직 확인되지 않았다.",
      choices: [
        {
          id: "q20-choice-1",
          text: "연막을 빠르게 만들고\n어느 정도 위험을 감수해서 구조를 시도한다.",
          scoreDelta: { main: { risk: 1 } },
        },
        {
          id: "q20-choice-2",
          text: "추가 손실 위험이 크다고 판단하면\n구조를 포기하고 남은 인원으로 운영한다.",
          scoreDelta: { main: { safe: 1 } },
        },
      ],
    },
    {
      id: "q21",
      text: "첫 번째 자기장이 가까운 편이고,\n지금 바로 출발하면 인서클에서 좋은 자리나 이동 주도권을 먼저 잡을 수 있다.\n현재 전투는 가능하지만\n탄약·회복·투척물이 조금 부족하다.",
      choices: [
        {
          id: "q21-choice-1",
          text: "1페이즈 진입이 조금 늦어지더라도\n필요한 물자를 더 챙기고 출발한다.",
          scoreDelta: { sub: { fullLoot: 1 } },
        },
        {
          id: "q21-choice-2",
          text: "기본 전투가 가능하다면 바로 출발해\n먼저 좋은 위치나 이동 주도권을 잡고,\n부족한 물자는 이후 보충한다.",
          scoreDelta: { sub: { fastLoot: 1 } },
        },
      ],
    },
    {
      id: "q22",
      text: "차량에 추가 물자를 실을 수 있지만 공간에는 한계가 있다.\n팀원들의 기본 전투 장비는 이미 갖춰진 상태다.",
      choices: [
        {
          id: "q22-choice-1",
          text: "추가 탄약·회복·투척물을 넉넉하게 싣는다.",
          scoreDelta: { sub: { standardGear: 1 } },
        },
        {
          id: "q22-choice-2",
          text: "일부 일반 물자를 줄이더라도\n판처파우스트·박격포 같은 특수 장비를 싣는다.",
          scoreDelta: { sub: { specialGear: 1 } },
        },
      ],
    },
    {
      id: "q23",
      text: "비행기 동선상 큰 도시에는 여러 팀이 내리고 있고,\n외곽의 소규모 지역은 비교적 비어 있다.\n두 곳 모두 필요한 파밍은 가능하다.",
      choices: [
        {
          id: "q23-choice-1",
          text: "초반부터 교전 기회가 있는 큰 도시 쪽을 선택한다.",
          scoreDelta: { sub: { hotdrop: 1 } },
        },
        {
          id: "q23-choice-2",
          text: "초반 충돌을 줄이고\n안정적으로 파밍할 수 있는 외곽 지역을 선택한다.",
          scoreDelta: { sub: { tail: 1 } },
        },
      ],
    },
    {
      id: "q24",
      text: "현재 지역의 주요 건물은 대부분 파밍했고\n기본 장비도 갖췄다.\n조금 떨어진 곳에 아직 파밍하지 않은 창고나 건물이 남아 있지만,\n그쪽까지 들르면 이동 시간이 더 길어진다.",
      choices: [
        {
          id: "q24-choice-1",
          text: "남은 건물까지 확인해서 물자를 더 챙긴 뒤 이동한다.",
          scoreDelta: { sub: { fullLoot: 1 } },
        },
        {
          id: "q24-choice-2",
          text: "기본 장비가 갖춰졌다면\n추가 파밍은 생략하고 바로 다음 이동을 시작한다.",
          scoreDelta: { sub: { fastLoot: 1 } },
        },
      ],
    },
  ],
} as const satisfies QuestionSet;
