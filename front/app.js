// app.js

const AUTH_BASE   = 'http://127.0.0.1:5001';
const API_BASE    = 'http://127.0.0.1:1122';
const RECORD_BASE = 'http://127.0.0.1:1133';

// 建立 axios 實例，自動攜帶 Cookie（Session）
const httpAuth   = axios.create({ baseURL: AUTH_BASE,   withCredentials: true });
const httpFood   = axios.create({ baseURL: API_BASE,    withCredentials: true });
const httpRecord = axios.create({ baseURL: RECORD_BASE, withCredentials: true });

// ------- 1. Login 組件 (template 看上面 index.html) -------
const Login = {
  template: '#login-template',
  data() {
    return {
      username: '',
      password: '',
      message: ''
    };
  },
  computed: {
    messageClass() {
      return this.message.startsWith('已') ? 'success' : 'error';
    }
  },
  methods: {
    removeReadonly(e) {
      e.target.removeAttribute('readonly');
    },
    async doLogin() {
      if (!this.username || !this.password) {
        this.message = '請輸入帳號與密碼。';
        return;
      }
      try {
        const resp = await httpAuth.post('/login', {
          username: this.username,
          password: this.password
        });
        if (resp.data.message === '登入成功') {
          // 拿 user_id + username
          const who = await httpAuth.get('/whoami');
          if (who.data.logged_in) {
            localStorage.setItem('userId', who.data.user_id);
            localStorage.setItem('username', who.data.username);
            this.$router.replace('/');
            return;
          }
        }
        this.message = '登入失敗';
      } catch (err) {
        this.message = err.response?.data?.error || '網路錯誤，請稍後再試。';
      }
    }
  },
  mounted() {
    const msg = this.$route.query.msg;
    if (msg) this.message = msg;
  }
};

// ------- 2. Signup 組件 -------
const Signup = {
  template: '#signup-template',
  data() {
    return {
      username: '',
      password: '',
      message: ''
    };
  },
  computed: {
    messageClass() {
      return 'error';
    }
  },
  methods: {
    removeReadonly(e) {
      e.target.removeAttribute('readonly');
    },
    async doSignup() {
      if (!this.username || !this.password) {
        this.message = '請輸入帳號與密碼。';
        return;
      }
      try {
        const resp = await httpAuth.post('/signup', {
          username: this.username,
          password: this.password
        });
        if (resp.status === 201) {
          // 註冊成功，跳回 login 並顯示訊息
          this.$router.replace({ path: '/login', query: { msg: '已註冊，請重新登入。' } });
          return;
        }
      } catch (err) {
        if (err.response && err.response.status === 409) {
          this.message = '此使用者名稱已被註冊。';
        } else {
          this.message = err.response?.data?.error || '註冊失敗，請稍後再試。';
        }
      }
    }
  }
};

// ------- 3. Dashboard（首頁）組件 -------
const Dashboard = {
  template: '#dashboard-template',
  data() {
    return {
      today: new Date(),
      weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      todayIndex: null,
      todayFormatted: '',
      todayRecords: [],
      records: [],
      todayCalories: 0,
      calorieRatio: 0,    // 用於畫圓形進度 (0～1)
      progressColor: '#4caf50',
      error: ''
    };
  },
  methods: {
    formatDateTime(dtStr) {
      // "YYYY-MM-DD HH:MM:SS" → "HH:MM"
      const dt = new Date(dtStr.replace(' ', 'T'));
      const hh = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      return `${hh}:${mi}`;
    },
    async fetchData() {
      try {
        // 1. whoami 確認登入
        const who = await httpAuth.get('/whoami');
        if (!who.data.logged_in) {
          this.$router.replace('/login');
          return;
        }
        // 2. 先撈全部今日（與全部）飲食紀錄
        const allResp = await httpRecord.get('/diet-records');
        this.records = allResp.data.sort((a,b) => (new Date(b.record_time)) - (new Date(a.record_time)));

        // 3. 計算「今天範圍」(YYYY-MM-DD)
        const yyyy = this.today.getFullYear();
        const mm = String(this.today.getMonth()+1).padStart(2,'0');
        const dd = String(this.today.getDate()).padStart(2,'0');
        const todayPrefix = `${yyyy}-${mm}-${dd}`;

        // 4. 篩出 todayRecords
        this.todayRecords = this.records.filter(r => r.record_time.startsWith(todayPrefix));

        // 5. 計算 todayCalories 總和
        this.todayCalories = this.todayRecords.reduce((sum,r) => sum + r.calorie_sum, 0);

        // 6. 進度 (假設每日目標 2000kcal，可自行修改)
        const goal = 2000;
        this.calorieRatio = Math.min(this.todayCalories / goal, 1);

        // 7. 今天星期幾 (0 = 星期日 … 6 = 星期六)，要轉成我們 array 索引(0=MON…6=SUN)
        let dow = this.today.getDay(); // 0 ~ 6, Sunday=0
        // our weekdays[0] = MON … [6] = SUN
        // 所以 (dow=1→週一→index=0, dow=0→週日→index=6)
        this.todayIndex = (dow === 0) ? 6 : (dow - 1);

        // 8. 格式化今天日期 "2025-06-06"
        this.todayFormatted = `${yyyy}-${mm}-${dd}`;

      } catch (err) {
        this.error = '讀取資料失敗，請重新登入。';
        this.$router.replace('/login');
      }
    },
    goToAllRecords() {
      this.$router.push('/all-records');
    },
    goToCustomFoods() {
      this.$router.push('/custom-foods');
    },
  },
  async mounted() {
    await this.fetchData();
  },
  computed: {
    // 計算圓圈周長，用來 stroke-dasharray
    circumference() {
      const radius = 54;
      return 2 * Math.PI * radius;
    }
  }
};

// ------- 4. All Records（完整列表）組件 -------
const AllRecords = {
  template: '#all-records-template',
  data() {
    return {
      records: [],
      error: ''
    };
  },
  methods: {
    formatDateTime(dtStr) {
      const dt = new Date(dtStr.replace(' ', 'T'));
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth()+1).padStart(2,'0');
      const dd = String(dt.getDate()).padStart(2,'0');
      const hh = String(dt.getHours()).padStart(2,'0');
      const mi = String(dt.getMinutes()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    },
    async fetchAll() {
      try {
        // 檢查登入
        const who = await httpAuth.get('/whoami');
        if (!who.data.logged_in) {
          this.$router.replace('/login');
          return;
        }
        const resp = await httpRecord.get('/diet-records');
        this.records = resp.data.sort((a,b) => (new Date(b.record_time)) - (new Date(a.record_time)));
      } catch {
        this.error = '讀取失敗，請重新登入。';
        this.$router.replace('/login');
      }
    }
  },
  async mounted() {
    await this.fetchAll();
  }
};

// ------- 5. Custom Foods（自訂食物）組件 -------
const CustomFoods = {
  template: '#custom-foods-template',
  data() {
    return {
      foods: [],
      error: ''
    };
  },
  methods: {
    async fetchFoods() {
      try {
        const who = await httpAuth.get('/whoami');
        if (!who.data.logged_in) {
          this.$router.replace('/login');
          return;
        }
        const uid = who.data.user_id;
        const resp = await httpFood.get('/customer-foods', { params: { user_id: uid } });
        this.foods = resp.data;
      } catch {
        this.error = '讀取失敗，請重新登入。';
        this.$router.replace('/login');
      }
    },
    goToAddFood() {
      this.$router.push('/add-food');
    }
  },
  async mounted() {
    await this.fetchFoods();
  }
};

// ------- 6. Add Food（新增自訂食物）組件 -------
const AddFood = {
  template: '#add-food-template',
  data() {
    return {
      form: {
        name: '',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0
      },
      error: ''
    };
  },
  methods: {
    async submitFood() {
      if (!this.form.name) {
        this.error = '請輸入食物名稱';
        return;
      }
      try {
        await httpFood.post('/customer-foods', {
          user_id: localStorage.getItem('userId'),
          name:    this.form.name,
          calories:this.form.calories,
          protein: this.form.protein,
          fat:     this.form.fat,
          carbs:   this.form.carbs
        });
        this.$router.replace('/custom-foods');
      } catch (err) {
        if (err.response && err.response.status === 400) {
          this.error = '請補齊所有欄位';
        } else if (err.response && err.response.status === 409) {
          this.error = '同名自訂食物已存在';
        } else {
          this.error = '新增失敗，請稍後再試。';
        }
      }
    }
  }
};

// ------- 7. Vue Router 設定 -------
const routes = [
  { path: '/login',        component: Login },
  { path: '/signup',       component: Signup },
  { path: '/',             component: Dashboard },
  { path: '/all-records',  component: AllRecords },
  { path: '/custom-foods', component: CustomFoods },
  { path: '/add-food',     component: AddFood }
];
const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes
});
router.beforeEach((to, from, next) => {
  // login/signup 不需檢查
  if (to.path === '/login' || to.path === '/signup') {
    return next();
  }
  // 其他頁面都要先檢查 localStorage 內有無 username
  if (!localStorage.getItem('username')) {
    return next('/login');
  }
  next();
});

// ------- 8. 建立 Vue App 並掛載 -------
const app = Vue.createApp({});
app.use(router);
app.mount('#app');

