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
        await httpAuth.post('/login',{username:this.u,password:this.p});
        await store.checkLogin();
        if(store.isLoggedIn) this.$router.replace('/');
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
  async mounted(){ await store.fetchFoods(); }
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
router.beforeEach(async(to,from,next)=>{
  if(!store.isLoggedIn && to.path!='/login'){
    await store.checkLogin();
    if(!store.isLoggedIn) return next('/login');
  }
  if(store.isLoggedIn && to.path==='/login') return next('/');
  next();
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

