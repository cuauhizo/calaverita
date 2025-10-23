<template>
  <section id="section1"
    class="flex flex-wrap justify-items-center items-center content-center min-h-lvh gap-12 py-[5rem] bg-gray-900 text-white">
    <div class="w-full" data-aos="fade-right" data-aos-anchor-placement="top-bottom">
      <h1 class="hero-text font-lemon-bold text-center text-[2.244rem] md:text-[3.196rem] font-bold text-orange-300">
        ¡Ups! Página no
        encontrada</h1>
    </div>
    <div class="space-y-6 md:space-y-8 w-full" data-aos="fade-left">
      <h2 class="uppercase text-center leading-7">
        <span class="text-[1.246rem] font-lemon-light">Lo sentimos, la página que buscas no existe.</span>
      </h2>
    </div>
    <div class="w-full flex justify-center items-center">
      <router-link to="/"
        class="inline-flex gap-2 rounded-full transition-all mt-2 font-lemon-normal text-[15px] justify-center items-center bg-orange-300 text-white px-8 py-2">Ir
        a inicio</router-link>
    </div>
  </section>
</template>
