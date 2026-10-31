import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PerfilMenu } from './perfil-menu';

describe('PerfilMenu', () => {
  let component: PerfilMenu;
  let fixture: ComponentFixture<PerfilMenu>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PerfilMenu],
    }).compileComponents();

    fixture = TestBed.createComponent(PerfilMenu);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
