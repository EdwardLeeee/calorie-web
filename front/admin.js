/* ================= 後端 base URL ================= */
const AUTH = 'http://127.0.0.1:5002';   // auth_admin.py
const API  = 'http://127.0.0.1:5003';   // admin_app.py
const httpAuth = axios.create({ baseURL: AUTH, withCredentials: true });
const httpFood = axios.create({ baseURL: API,  withCredentials: true });

/* ================= 簡易 Store ================= */
const store = Vue.reactive({
  isLoggedIn : false,
  foods      : [],
  async fetchFoods(){
    if (!this.isLoggedIn) return;
    const r = await httpFood.get('/foods');
    this.foods = r.data;
  },
  async checkLogin(){
    const r = await httpAuth.get('/whoami').catch(()=>({status:401}));
    this.isLoggedIn = r.status===200;
    if (this.isLoggedIn) await this.fetchFoods();
  }
});

/* ================= Login 組件 ================= */
const AdminLogin = {
  template:'#admin-login-tmpl',
  data(){ return{ u:'', p:'', msg:'' };},
  methods:{
    async login(){
      try{
        // 登入請求，如果失敗，會直接跳到 catch
        await httpAuth.post('/login',{username:this.u,password:this.p});

        // 程式能走到這裡，就代表登入100%成功了
        // 我們直接更新前端的狀態，不需要再問後端
        store.isLoggedIn = true;

        // 因為馬上要跳轉到主控台，主控台會需要食物資料，所以在這裡先取得
        await store.fetchFoods();

        // 直接跳轉到主控台頁面
        this.$router.replace('/');
      }catch(e){
        this.msg = e.response?.data?.msg || '登入失敗';
      }
    }
  }
};

/* ================= 食品列表 ================= */
const FoodsDash = {
  template:'#foods-dashboard-tmpl',
  computed:{
    foods(){ return store.foods; }
  },
  methods:{
    labelOf(f){return `${f.name} (${f.calories.toFixed(0)} kcal)`},
    toAdd(){ this.$router.push('/edit-food'); },
    edit(f){ this.$router.push({path:'/edit-food',query:{id:f.id}}); },
    async del(id){
      if(!confirm('確定刪除？')) return;
      await httpFood.delete(`/foods/${id}`);
      await store.fetchFoods();
    }
  },
  //async mounted(){ await store.fetchFoods(); }
};

/* ================= 新增 / 編輯 食物 ================= */
const EditFood = {
  template:'#edit-food-tmpl',
  data(){
    return{
      form:{ name:'',calories:null,carbs:null,protein:null,fat:null },
      editing:false, id:null, err:''
    };
  },
  computed:{ fields(){return{
    name:'名稱', calories:'卡路里 (kcal)', carbs:'碳水 (g)',
    protein:'蛋白質 (g)', fat:'脂肪 (g)'
  } } },
  async mounted(){
    this.id = this.$route.query.id ? +this.$route.query.id : null;
    this.editing = !!this.id;
    if(this.editing){
      const f = store.foods.find(x=>x.id===this.id);
      if(f) this.form = {...f};
    }
  },
  methods:{
    async submit(){
      try{
        if(this.editing)
          await httpFood.put(`/foods/${this.id}`, this.form);
        else
          await httpFood.post('/foods', this.form);
        await store.fetchFoods();
        this.$router.replace('/');
      }catch(e){
        this.err='操作失敗';
        console.error(e);
      }
    }
  }
};

/* ================= Router ================= */
const routes=[
  {path:'/login', component:AdminLogin},
  {path:'/',      component:FoodsDash },
  {path:'/edit-food', component:EditFood}
];
const router = VueRouter.createRouter({
  history:VueRouter.createWebHashHistory(), routes
});
router.beforeEach(async (to, from, next) => {
  // 檢查目標路徑是否需要登入
  const requiresAuth = to.path !== '/login';

  // 如果 store 狀態是未登入，且 cookie 裡也沒登入資訊，就留在登入頁
  if (!store.isLoggedIn) {
    // 呼叫 checkLogin() 嘗試從 cookie 恢復登入狀態
    // 這對處理「使用者按 F5 重新整理頁面」的情況至關重要
    await store.checkLogin();
  }

  // 經過 checkLogin() 後，再次檢查最終的登入狀態
  if (requiresAuth && !store.isLoggedIn) {
    // 如果需要授權的頁面，但使用者最終仍未登入，則導向到登入頁
    next('/login');
  } else if (!requiresAuth && store.isLoggedIn) {
    // 如果目標是不需要授權的頁面 (即 /login)，但使用者已經登入了，
    // 則直接導向到主控台，而不是停在登入頁
    next('/');
  } else {
    // 其他所有情況 (例如: 已登入且要去主控台)，都直接放行
    next();
  }
});

/* ================= 主 App ================= */
const app = Vue.createApp({
  computed:{ isLoggedIn(){return store.isLoggedIn;}},
  methods:{
    async logout(){
      await httpAuth.post('/logout').catch(()=>{});
      store.isLoggedIn=false;
      router.replace('/login');
    }
  },
  provide(){ return{ store }; }
});
app.use(router);
app.mount('#app');

